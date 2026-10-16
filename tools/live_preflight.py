#!/usr/bin/env python3
"""Live preflight: proves Gemini and Supabase work with YOUR keys, before demo day. Python 3 only.

    export GEMINI_API_KEY=...            GEMINI_MODEL=gemini-3.8-flash   # same values as production
    export NEXT_PUBLIC_SUPABASE_URL=...  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
    python tools/live_preflight.py            # add --json to save a measurement report

What it checks (each line is PASS / FAIL / WARN / SKIP):
  Gemini    every model in the fallback chain exists and supports generateContent
            a reply in English, Telugu, Hindi and Tamil comes back non-empty and in the right script
            the tool-call round trip works (the thought-signature path that has never run live)
            latency and token usage per call -> real cost and latency numbers for your report
  Supabase  the public tables are readable with the browser-safe key
            private tables (sessions, escalations, audit_log, messages) return no rows to that key

Exit code 0 = no FAIL. Nothing is written to your database; the service-role key is never used.
GEMINI_BASE_URL / SUPABASE overrides exist only so the script itself can be tested against a stub.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

GEMINI_BASE = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta").rstrip("/")
SCRIPTS = {  # Unicode block of the expected script, to catch a model answering in the wrong language
    "te": (0x0C00, 0x0C7F),
    "hi": (0x0900, 0x097F),
    "ta": (0x0B80, 0x0BFF),
}
PROMPTS = {
    "en": ("Reply in simple English.", "My son wants to join an ITI. Is that a safe choice? Answer in two sentences."),
    "te": ("Reply in clear, natural Telugu.", "మా అబ్బాయి ITIలో చేరాలనుకుంటున్నాడు. ఇది సురక్షితమైన ఎంపికేనా? రెండు వాక్యాల్లో చెప్పండి."),
    "hi": ("Reply in Hindi.", "मेरा बेटा ITI में जाना चाहता है। क्या यह सुरक्षित चुनाव है? दो वाक्यों में बताइए।"),
    "ta": ("Reply in clear, natural Tamil.", "என் மகன் ITI-யில் சேர விரும்புகிறான். இது பாதுகாப்பான தேர்வா? இரண்டு வாக்கியங்களில் சொல்லுங்கள்."),
}
PUBLIC_TABLES = ["trades", "outcomes", "providers", "schemes"]
PRIVATE_TABLES = ["sessions", "messages", "escalations", "audit_log", "escalation_contacts"]

report = {"checks": [], "gemini_calls": []}


def check(status, name, detail=""):
    report["checks"].append({"status": status, "name": name, "detail": detail})
    print(f"{status:5} {name}" + (f"  -> {detail}" if detail else ""))


def http(method, url, headers=None, body=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace"), time.perf_counter() - started
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), time.perf_counter() - started
    except Exception as e:  # DNS, TLS, timeout
        return 0, str(e), time.perf_counter() - started


def parse(text):
    try:
        return json.loads(text)
    except ValueError:
        return {}


def model_chain():
    primary = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()
    chain = []
    for name in [primary, *os.getenv("GEMINI_FALLBACK_MODELS", "gemini-2.5-flash").split(",")]:
        name = name.strip()
        if name and name not in chain:
            chain.append(name)
    return chain


def thinking(model):
    return {"thinking_level": "low"} if model.startswith("gemini-3") else {"thinking_budget": 0}


def gemini_headers(key):
    return {"Content-Type": "application/json", "x-goog-api-key": key}


def generate(model, key, body):
    status, text, secs = http("POST", f"{GEMINI_BASE}/models/{model}:generateContent", gemini_headers(key), body)
    payload = parse(text)
    usage = payload.get("usageMetadata", {})
    report["gemini_calls"].append({
        "model": model, "status": status, "seconds": round(secs, 2),
        "prompt_tokens": usage.get("promptTokenCount"), "output_tokens": usage.get("candidatesTokenCount"),
        "thought_tokens": usage.get("thoughtsTokenCount"), "total_tokens": usage.get("totalTokenCount"),
    })
    return status, payload, secs


def reply_text(payload):
    parts = (payload.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
    return "".join(p.get("text", "") for p in parts if isinstance(p, dict)).strip()


def check_gemini():
    key = os.getenv("GEMINI_API_KEY", "")
    if not key:
        check("SKIP", "Gemini", "GEMINI_API_KEY not set")
        return
    chain = model_chain()
    status, text, _ = http("GET", f"{GEMINI_BASE}/models?pageSize=200", gemini_headers(key))
    if status != 200:
        check("FAIL", "Gemini key accepted / model list reachable", f"HTTP {status}: {text[:120]}")
        return
    check("PASS", "Gemini key accepted")
    available = {m["name"].split("/")[-1]: m for m in parse(text).get("models", [])}
    working = []
    for i, model in enumerate(chain):
        info = available.get(model)
        role = "primary" if i == 0 else "fallback"
        if info is None:
            # The exact error that would silently turn chat into canned answers.
            check("FAIL" if i == 0 else "WARN", f"{role} model '{model}' exists", "not in this key's model list")
        elif "generateContent" not in info.get("supportedGenerationMethods", []):
            check("FAIL" if i == 0 else "WARN", f"{role} model '{model}' supports generateContent")
        else:
            check("PASS", f"{role} model '{model}' exists and supports generateContent")
            working.append(model)
    if not working:
        check("FAIL", "At least one usable Gemini model", "chat will fall back to canned answers")
        return
    if chain[0] not in working:
        check("WARN", "Primary model unusable", f"app will use fallback '{working[0]}'; fix GEMINI_MODEL")
    model = working[0]

    for lang, (instruction, question) in PROMPTS.items():
        body = {
            "system_instruction": {"parts": [{"text": "You are Parivar Path, a family vocational guidance assistant. " + instruction}]},
            "contents": [{"role": "user", "parts": [{"text": f"<user_message>{question}</user_message>"}]}],
            "generation_config": {"temperature": 0.2, "max_output_tokens": 1024, "thinking_config": thinking(model)},
        }
        status, payload, secs = generate(model, key, body)
        text = reply_text(payload)
        if status != 200 or not text:
            check("FAIL", f"[{model}] {lang} reply", f"HTTP {status}, empty={not text}")
            continue
        if lang in SCRIPTS:
            lo, hi = SCRIPTS[lang]
            share = sum(lo <= ord(c) <= hi for c in text) / max(1, sum(not c.isspace() for c in text))
            ok = share > 0.4
            check("PASS" if ok else "FAIL", f"[{model}] {lang} reply is in the right script ({secs:.1f}s)",
                  "" if ok else f"only {share:.0%} of characters are {lang} script")
        else:
            check("PASS", f"[{model}] en reply ({secs:.1f}s)")

    # Tool round trip, forcing a function call, echoing the ORIGINAL part (thought signature included).
    tool = {"function_declarations": [{
        "name": "get_verified_outcomes", "description": "Fetch verified outcome data.",
        "parameters": {"type": "object", "properties": {"district": {"type": "string"}, "trade": {"type": "string"}},
                       "required": ["district", "trade"]}}]}
    base = {
        "system_instruction": {"parts": [{"text": "Always call the tool before answering."}]},
        "contents": [{"role": "user", "parts": [{"text": "<user_message>Placement for Electrician in Warangal?</user_message>"}]}],
        "tools": [tool],
        "tool_config": {"function_calling_config": {"mode": "ANY"}},
        "generation_config": {"temperature": 0.2, "max_output_tokens": 1024, "thinking_config": thinking(model)},
    }
    status, payload, _ = generate(model, key, base)
    parts = (payload.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
    call_part = next((p for p in parts if isinstance(p, dict) and "functionCall" in p), None)
    if status != 200 or not call_part:
        check("FAIL", f"[{model}] tool call issued", f"HTTP {status}")
        return
    follow = dict(base)
    follow.pop("tool_config")
    follow["contents"] = base["contents"] + [
        {"role": "model", "parts": [call_part]},
        {"role": "user", "parts": [{"functionResponse": {"name": call_part["functionCall"]["name"],
                                                           "response": {"data": {"placement_rate": None, "note": "unavailable"}}}}]},
    ]
    status, payload, secs = generate(model, key, follow)
    ok = status == 200 and bool(reply_text(payload))
    check("PASS" if ok else "FAIL", f"[{model}] tool-call round trip ({secs:.1f}s)",
          "" if ok else f"HTTP {status}: follow-up rejected (thought signature?)")


def check_supabase():
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    key = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
    if not url or not key:
        check("SKIP", "Supabase", "NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY not set")
        return
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    for table in PUBLIC_TABLES:
        status, text, secs = http("GET", f"{url}/rest/v1/{table}?select=*&limit=1", headers)
        rows = parse(text)
        if status == 200 and isinstance(rows, list) and rows:
            check("PASS", f"public table '{table}' readable and non-empty ({secs:.2f}s)")
        elif status == 200:
            check("WARN", f"public table '{table}' readable but EMPTY", "run the seed / import your dataset")
        else:
            check("FAIL", f"public table '{table}' readable", f"HTTP {status}: {text[:100]}")
    for table in PRIVATE_TABLES:
        status, text, _ = http("GET", f"{url}/rest/v1/{table}?select=*&limit=1", headers)
        rows = parse(text)
        leaked = status == 200 and isinstance(rows, list) and len(rows) > 0
        check("FAIL" if leaked else "PASS", f"private table '{table}' hidden from the browser key",
              "ROWS RETURNED TO ANON - RLS is not protecting this table" if leaked else "")


def main():
    print(f"Parivar Path live preflight  (Gemini chain: {', '.join(model_chain())})\n")
    check_gemini()
    print()
    check_supabase()
    calls = report["gemini_calls"]
    if calls:
        total = sum(c["total_tokens"] or 0 for c in calls)
        slow = max(c["seconds"] for c in calls)
        print(f"\nGemini: {len(calls)} calls, {total} tokens total, slowest {slow}s. Multiply by your price per 1M tokens "
              f"for a per-conversation cost.")
    fails = [c for c in report["checks"] if c["status"] == "FAIL"]
    print(f"\n{len(fails)} FAIL, {sum(c['status'] == 'WARN' for c in report['checks'])} WARN, "
          f"{sum(c['status'] == 'PASS' for c in report['checks'])} PASS")
    if "--json" in sys.argv:
        with open("live_preflight_report.json", "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        print("wrote live_preflight_report.json")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
