#!/usr/bin/env python3
"""Measure the deterministic (non-LLM) per-message pipeline: classify -> validate numbers.

    cd services/api && JWT_SECRET=$(python -c "import secrets;print(secrets.token_hex(24))") python ../../tools/benchmark_pipeline.py

Reports median / p95 / p99 in milliseconds over many runs, per language. This is everything that runs
on your server per message EXCEPT the Gemini call, so it shows the app's own overhead.
"""
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path.cwd()))
from app.core.classifier import classify_concerns  # noqa: E402
from app.core.grounding import validate_reply  # noqa: E402

TEXTS = {
    "en": "My son wants an ITI course but we worry there are no jobs and people will say he failed. What will he earn?",
    "te": "మా అబ్బాయి ITI చేయాలనుకుంటున్నాడు కానీ ఉద్యోగం వస్తుందా? జీతం ఎంత వస్తుంది? ఇజ్జత్ పోతుందేమో.",
    "hi": "मेरा बेटा ITI करना चाहता है लेकिन नौकरी मिलेगी या नहीं? तनख्वाह कितनी होगी? लोग क्या कहेंगे?",
    "ta": "என் மகன் ITI படிக்க விரும்புகிறான் ஆனால் வேலை கிடைக்குமா? சம்பளம் எவ்வளவு? பாதுகாப்பு இருக்கிறதா?",
}
TOOL = {"get_outcomes": {"placement_rate": 78, "avg_start_salary_inr": 16500, "sample_size": 42}}
REPLY = "In this demo data about 78% were placed and the average starting pay is 16500 rupees, from 42 people."
N = 2000


def pct(values, p):
    values = sorted(values)
    return values[min(len(values) - 1, int(len(values) * p))]


print(f"{'lang':5} {'median ms':>10} {'p95 ms':>9} {'p99 ms':>9}   ({N} runs of classify + number-validate)")
for lang, text in TEXTS.items():
    times = []
    for _ in range(N):
        t0 = time.perf_counter()
        classify_concerns(text)
        validate_reply(REPLY, TOOL)
        times.append((time.perf_counter() - t0) * 1000)
    print(f"{lang:5} {statistics.median(times):10.3f} {pct(times, .95):9.3f} {pct(times, .99):9.3f}")
