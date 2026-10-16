# Performance measurements

All numbers below were measured on 16 Oct 2026 in a Linux sandbox (shared CPU), from this repository's code. Re-run the commands to reproduce on your own machine. **Gemini latency and token cost are not here because they need your API key: run `python tools/live_preflight.py --json` and paste its figures into this file.**

## Frontend bundle (`npm run build`, Next.js 14.2.35, `output: 'standalone'`)

| Route | Page JS | First Load JS |
|---|---|---|
| `/` | 3.06 kB | 102 kB |
| `/consent` | 2.49 kB | 102 kB |
| `/profile` | 3.58 kB | 103 kB |
| `/joint` | 4.83 kB | 104 kB |
| `/research` | 3.02 kB | 90.3 kB |
| `/chat` | 7.71 kB | 186 kB |
| `/summary` | 5.12 kB | 184 kB |
| `/trades` | 3.29 kB | 178 kB |
| `/trades/[id]` | 4.77 kB | 183 kB |
| `/admin`, `/counsellor` | 2.21 kB | 159 kB |
| `/counsellor/dashboard` | 4.35 kB | 167 kB |
| dashboards | 3.2-3.7 kB | 166 kB |

Shared by all routes: 87.3 kB. The heavier pages (160-186 kB) load charts or the map.
Fonts are self-hosted variable fonts with per-script subsets, so a Telugu visitor downloads only the Telugu file, and the build needs no internet.

## Server response (production build, local `next start`)

Pages return HTTP 200 in 5-110 ms (first request 109 ms, warm 5-22 ms). The standalone server (`node server.js`, as used by the Dockerfile) was started and probed: pages 200, `/api/health` 200, malformed chat body 400.

## Per-message pipeline excluding the LLM (`tools/benchmark_pipeline.py`, 2,000 runs)

| Language | median | p95 | p99 |
|---|---|---|---|
| English | 0.17 ms | 0.34 ms | 0.46 ms |
| Telugu | 0.25 ms | 0.43 ms | 0.49 ms |
| Hindi | 0.32 ms | 0.64 ms | 0.72 ms |
| Tamil | 0.28 ms | 0.59 ms | 0.70 ms |

Classification and number-grounding add under 1 ms per message. User-visible latency is the Gemini call (12 s timeout, one retry, then the fallback model).

## Cost controls already in the code

- `max_output_tokens` is 1024; thinking is `low` (Gemini 3) or off (Gemini 2.x fallback).
- Crisis messages, refusals and demo answers never call the LLM.
- Rate limit: 30 requests/minute per identity (shared across instances when `REDIS_URL` is set).

## Not yet measured

- Gemini latency per language and tokens per conversation (run the preflight).
- Concurrent-user load (no load test has been run).
- Real-device performance on a low-end Android phone.
