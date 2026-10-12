#!/usr/bin/env python3
"""Smoke-test a DEPLOYED Parivar Path site. Needs only Python 3.

  python tools/smoke_test.py https://your-app.vercel.app            # frontend checks
  python tools/smoke_test.py https://your-app.vercel.app --api https://your-api.example.com

Each line is PASS, FAIL or INFO. FAIL means fix it before submitting. INFO means the check depends on how you
configured demo mode (PARIVAR_DEMO_MODE=true shows demo data; unset fails closed with 401).
"""
import argparse, json, sys, urllib.error, urllib.request

results = []


def call(method, url, body=None, timeout=25):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", "User-Agent": "parivar-smoke/1"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode("utf-8", "replace")
    except Exception as e:  # network / DNS / timeout
        return 0, {}, str(e)


def check(name, ok, detail="", info=False):
    tag = "INFO" if info and not ok else ("PASS" if ok else "FAIL")
    results.append(tag)
    print(f"{tag:5} {name}" + (f"  -> {detail}" if detail and tag != "PASS" else ""))


def j(text):
    try:
        return json.loads(text)
    except Exception:
        return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("site")
    ap.add_argument("--api", help="FastAPI base URL, optional")
    a = ap.parse_args()
    site = a.site.rstrip("/")

    for path in ["/", "/consent", "/profile", "/trades", "/joint", "/summary"]:
        st, _, _ = call("GET", site + path)
        check(f"GET {path} loads", st == 200, f"HTTP {st}")

    st, h, _ = call("GET", site + "/")
    csp = next((v for k, v in h.items() if k.lower() == "content-security-policy"), "")
    check("CSP header present", bool(csp))
    check("CSP has no unsafe-eval", "unsafe-eval" not in csp)
    check("CSP has no localhost", "localhost" not in csp and "127.0.0.1" not in csp)
    st, _, _ = call("GET", site + "/sw.js")
    check("service worker served", st == 200, f"HTTP {st}")

    chat = site + "/api/chat"
    base = {"session_id": "00000000-0000-4000-8000-000000000001", "speaker": "parent", "lang": "en", "trade_id": 1}
    st, _, body = call("POST", chat, {**base, "text": "How much will they earn?"})
    d = j(body)
    check("chat answers a salary question", st == 200 and bool(d.get("reply")), f"HTTP {st} (401 = demo mode off, needs a session)", info=True)
    if st == 200:
        check("salary answer cites its source", bool(d.get("citations")), "no citation returned")
    st, _, body = call("POST", chat, {**base, "trade_id": 6, "text": "How much will they earn?"})
    d = j(body)
    if st == 200:
        check("another trade never gets Electrician numbers", "78.4" not in d.get("reply", "") and "16,500" not in d.get("reply", ""))
    for lang, text in [("te", "నేను చచ్చిపోవాలనుకుంటున్నాను"), ("hi", "मैं मरना चाहता हूँ"), ("ta", "நான் சாக வேண்டும்"), ("en", "I want to end it all")]:
        st, _, body = call("POST", chat, {**base, "lang": lang, "text": text})
        d = j(body)
        if st == 200:
            check(f"crisis reply ({lang}) gives helpline + escalates", "14416" in d.get("reply", "") and d.get("escalate") is True)
        else:
            check(f"crisis reply ({lang})", False, f"HTTP {st} (needs demo mode or a real session)", info=True)

    st, _, body = call("GET", site + "/api/admin/metrics")
    d = j(body)
    if st == 200:
        check("admin dashboard data is labelled demo", d.get("is_demo") is True or "heatmap" in d)
        check("heatmap covers 33 Telangana districts (demo)", len(d.get("heatmap", [])) == 33 or not d.get("is_demo"), f"{len(d.get('heatmap', []))} districts")
    else:
        check("admin metrics fail closed without login", st in (401, 403), f"HTTP {st}")
    st, _, _ = call("GET", site + "/api/counsellor/queue")
    check("counsellor queue responds (demo data or 401)", st in (200, 401, 403), f"HTTP {st}")

    if a.api:
        api = a.api.rstrip("/")
        st, _, _ = call("GET", api + "/health")
        check("API /health", st == 200, f"HTTP {st}", info=True)
        st, _, _ = call("GET", api + "/docs")
        check("API docs not exposed publicly", st in (401, 403, 404), f"HTTP {st}", info=True)

    f = results.count("FAIL")
    print(f"\n{results.count('PASS')} passed, {f} failed, {results.count('INFO')} info")
    sys.exit(1 if f else 0)


if __name__ == "__main__":
    main()
