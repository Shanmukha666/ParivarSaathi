# Efficiency and cost

Every figure here is either **measured** (with the command that produced it) or **read from the code**.
Anything that needs your API key or a live deployment is listed under "Not yet measured" instead of
being estimated. An earlier version of this file contained latency, Core Web Vitals and price figures
that had never been measured; they were removed.

## Measured

| What | Result | How to reproduce |
|---|---|---|
| Shared JS for every page | 87.3 kB | `cd apps/web && npm run build` |
| First Load JS per page | 89.5 kB (`/research`) to 186 kB (`/chat`) | same; full table in [PERFORMANCE.md](PERFORMANCE.md) |
| App overhead per message (classify + number check, no LLM) | under 1 ms at p99 in en/te/hi/ta | `python tools/benchmark_pipeline.py` |
| Production server, page response | 5-110 ms locally | `next start` / standalone `node server.js` |
| Full backend suite | 167 tests, about 2 s | `cd services/api && pytest` |
| Frontend suite | 108 tests, about 2 s | `cd apps/web && npx vitest run` |
| Database migrations + 69 RLS checks | about 10 s | `bash tools/verify_rls.sh` |

## Read from the code (not measured)

- LLM output is capped at 1024 tokens per reply (`provider.ts`, `gemini.py`). Thinking is `low` on
  Gemini 3 and off on the Gemini 2.x fallback. Thinking tokens are billed as output, so 1024 is the
  ceiling, not the typical size.
- One family message makes at most one Gemini exchange (two requests when the model calls the
  outcome tool). On a 5xx or timeout there is one retry on the same model, then one attempt per fallback model, so a
  single message can cost at most 2 attempts per model in the chain.
- No LLM call at all for: crisis messages, refusals, missing-evidence answers, demo mode.
- Abuse limits: 30 requests/min per user (per server instance), 30 messages per session, and
  database-enforced 100 messages/day and 5 sessions/day per user.
- Gemini timeout is 12 s per request.

## Not yet measured

Run `python tools/live_preflight.py --json` with your keys, which records latency and token counts per
language and for the tool-call round trip, then paste the output here.

| Item | Status |
|---|---|
| Gemini latency (p50/p90) per language | not measured |
| Tokens and cost per conversation | not measured; look up the current price for your model on Google's pricing page and multiply by the token counts from the preflight |
| Core Web Vitals on a real phone | not measured |
| Behaviour under concurrent load | no load test has been run |
