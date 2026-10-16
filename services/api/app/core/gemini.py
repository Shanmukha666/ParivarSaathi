"""Small, provider-specific Gemini client used by FastAPI AI workflows."""

import os
from typing import Any, Iterable

import httpx


class GeminiError(RuntimeError):
    """Gemini could not produce a usable response."""


class GeminiNotConfigured(GeminiError):
    """The server has no Gemini API key."""


def is_configured(api_key: str | None = None) -> bool:
    return bool(api_key or os.getenv("GEMINI_API_KEY"))


def model_chain() -> list[str]:
    """Primary model first, then fallbacks, de-duplicated and order-preserving.

    GEMINI_MODEL is the primary. GEMINI_FALLBACK_MODELS is a comma-separated list tried in order
    when the primary is unavailable (unknown model, quota, outage). One bad model name must never
    silently turn the whole chat into canned answers.
    """
    primary = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()
    fallbacks = os.getenv("GEMINI_FALLBACK_MODELS", "gemini-2.5-flash").split(",")
    chain: list[str] = []
    for name in [primary, *fallbacks]:
        name = name.strip()
        if name and name not in chain:
            chain.append(name)
    return chain


def _generation_config(model: str, temperature: float, max_output_tokens: int) -> dict[str, Any]:
    config: dict[str, Any] = {
        "temperature": temperature,
        # Thinking tokens count toward this cap, so leave headroom or replies can come back empty.
        "max_output_tokens": max(max_output_tokens, 1024),
    }
    if model.startswith("gemini-3"):
        config["thinking_config"] = {"thinking_level": "low"}
    else:
        # Gemini 2.x rejects thinking_level with HTTP 400; it uses a token budget instead.
        config["thinking_config"] = {"thinking_budget": 0}
    return config


# Statuses worth one retry on the same model (transient). Everything else moves to the next model.
_TRANSIENT = {500, 502, 503, 504}


async def _call_model(client: httpx.AsyncClient, model: str, key: str, payload: dict[str, Any]) -> str:
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    response = await client.post(
        endpoint,
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
        json=payload,
    )
    if response.status_code == 429:
        raise GeminiError("Gemini rate limit reached")
    if response.is_error:
        raise GeminiError(f"Gemini request failed with status {response.status_code}")
    try:
        parts = response.json()["candidates"][0]["content"]["parts"]
        text = "".join(part.get("text", "") for part in parts if isinstance(part, dict)).strip()
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise GeminiError("Gemini returned an unusable response") from exc
    if not text:
        raise GeminiError("Gemini returned an empty response")
    return text


async def generate_text(
    *,
    system_instruction: str,
    contents: Iterable[dict[str, Any]],
    api_key: str | None = None,
    max_output_tokens: int = 1024,
    temperature: float = 0.2,
) -> str:
    """Generate text with Gemini's REST API, with one retry and a model fallback chain."""
    key = api_key or os.getenv("GEMINI_API_KEY", "")
    if not key:
        raise GeminiNotConfigured("GEMINI_API_KEY is not configured")

    contents = list(contents)
    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=12.0) as client:
        for model in model_chain():
            payload = {
                "system_instruction": {"parts": [{"text": system_instruction}]},
                "contents": contents,
                "generation_config": _generation_config(model, temperature, max_output_tokens),
            }
            for attempt in range(2):
                try:
                    return await _call_model(client, model, key, payload)
                except httpx.HTTPError as exc:  # timeout / connection reset: retry once
                    last_error = GeminiError("Gemini request failed")
                    last_error.__cause__ = exc
                except GeminiError as exc:
                    last_error = exc
                    status = str(exc).rsplit(" ", 1)[-1]
                    if not (status.isdigit() and int(status) in _TRANSIENT):
                        break  # not transient: go straight to the next model
    raise last_error or GeminiError("Gemini request failed")
