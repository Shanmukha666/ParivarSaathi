"""The Gemini client must survive one bad model name or one transient failure."""
import httpx
import pytest

from app.core import gemini


def _ok(text="hello"):
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})


@pytest.fixture
def fake_post(monkeypatch):
    """Route AsyncClient.post to a scripted per-model response list; record every call."""
    calls: list[tuple[str, dict]] = []
    script: dict[str, list] = {}

    async def post(self, url, headers=None, json=None):
        model = url.split("/models/")[1].split(":")[0]
        calls.append((model, json))
        item = script[model].pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.8-flash")
    monkeypatch.setenv("GEMINI_FALLBACK_MODELS", "gemini-2.5-flash")
    return calls, script


async def _gen():
    return await gemini.generate_text(system_instruction="s", contents=[{"role": "user", "parts": [{"text": "hi"}]}])


def test_model_chain_dedupes_and_orders(monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "a")
    monkeypatch.setenv("GEMINI_FALLBACK_MODELS", "b, a ,,c")
    assert gemini.model_chain() == ["a", "b", "c"]


async def test_unknown_primary_model_falls_back(fake_post):
    calls, script = fake_post
    script["gemini-3.8-flash"] = [httpx.Response(404, json={})]
    script["gemini-2.5-flash"] = [_ok("from fallback")]
    assert await _gen() == "from fallback"
    # 404 is not transient: exactly one try on the primary, then the fallback.
    assert [m for m, _ in calls] == ["gemini-3.8-flash", "gemini-2.5-flash"]


async def test_transient_error_is_retried_on_same_model(fake_post):
    calls, script = fake_post
    script["gemini-3.8-flash"] = [httpx.Response(503, json={}), _ok("recovered")]
    assert await _gen() == "recovered"
    assert [m for m, _ in calls] == ["gemini-3.8-flash", "gemini-3.8-flash"]


async def test_timeout_is_retried_then_falls_back(fake_post):
    calls, script = fake_post
    script["gemini-3.8-flash"] = [httpx.ReadTimeout("t"), httpx.ReadTimeout("t")]
    script["gemini-2.5-flash"] = [_ok("late but fine")]
    assert await _gen() == "late but fine"
    assert len(calls) == 3


async def test_thinking_config_matches_model_family(fake_post):
    calls, script = fake_post
    script["gemini-3.8-flash"] = [httpx.Response(404, json={})]
    script["gemini-2.5-flash"] = [_ok()]
    await _gen()
    cfg = {m: p["generation_config"]["thinking_config"] for m, p in calls}
    assert cfg["gemini-3.8-flash"] == {"thinking_level": "low"}
    # Sending thinking_level to a 2.x model is an HTTP 400, which would defeat the fallback.
    assert cfg["gemini-2.5-flash"] == {"thinking_budget": 0}


async def test_rate_limit_skips_retry_and_uses_fallback(fake_post):
    calls, script = fake_post
    script["gemini-3.8-flash"] = [httpx.Response(429, json={})]
    script["gemini-2.5-flash"] = [_ok("ok")]
    assert await _gen() == "ok"
    assert len(calls) == 2


async def test_all_models_failing_raises(fake_post):
    _, script = fake_post
    script["gemini-3.8-flash"] = [httpx.Response(404, json={})]
    script["gemini-2.5-flash"] = [httpx.Response(500, json={}), httpx.Response(500, json={})]
    with pytest.raises(gemini.GeminiError):
        await _gen()


async def test_missing_key_is_not_configured(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(gemini.GeminiNotConfigured):
        await _gen()
