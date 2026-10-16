# v18: what changed and why

v18 is v16 plus a review pass in which every claim was checked by running it. Counts: backend 167 tests,
frontend 108 tests, database 69 row-level-security checks, lint 0 errors.

## Bugs that would have failed in live mode (all found by running the code, none by reading it)

| # | Bug | Fix | Proof |
|---|---|---|---|
| 1 | Counsellor `contact` / `resolve` / `close` sent timestamp columns the database refuses; every call failed with "permission denied". `close` also required a status the state machine forbids. Only `accept` worked. | Routes send only granted columns; a trigger stamps `contacted_at`/`closed_at`; resolve works from `assigned`; close from `assigned`/`contacted`. | RLS suite "exact statements" section; fails without migration `20261013000200` |
| 2 | Dashboard showed Accept only for status `queued`; live is `new`, demo is `pending`. **Counsellors could never accept a ticket.** | Status handling for both vocabularies | type-checked; demo routes return real simulated responses |
| 3 | Callback number never reached the counsellor (queue route omits it; the route that returns it was never called) | `GET /api/counsellor/[id]/contact`, loaded after accept | RLS suite phone checks |
| 4 | Dashboard faked success on failed accept / resolve / send, and blanked the queue on one failed refresh | Errors surfaced; last queue kept; queue filtered to active tickets, urgent first | code review |
| 5 | `concern_state` and `joint_counselling_state` were written as the family user (denied, error ignored): concern analytics always empty, joint counselling could never complete | Written server-side after the ownership check (`lib/session-state.ts`) | `route-contract.test.ts` (10 violations in the original routes) |
| 6 | Admins could read every family's raw chat; any counsellor could see every district's new tickets | Migration `20261013000100` | RLS suite; 2 checks fail without it |
| 7 | Distress check ran after the rate limit, 1000-char limit, trade requirement, 30-message cap and daily quota | Crisis path runs first, no LLM, honest about notification | `chat-route.test.ts` |
| 8 | Unsupported statistic was saved to the transcript before being checked; escalation flags ignored failed inserts | Validate, then store; flags reflect real tickets | `chat-route.test.ts` |
| 9 | Bad JSON or non-string `text` returned a bare 500 (also in demo mode) | `readJson` + type checks on every POST route | `http.test.ts`, `chat-route.test.ts` |
| 10 | Phone redaction missed `98765 43210`, `+91...`, `0...`, Indic digits, Aadhaar-style numbers; callback form rejected `+91 98765 43210` | `lib/redact.ts` | `redact.test.ts` (18 + 3) |
| 11 | Gemini fallback sent a Gemini-3 parameter to 2.5 (HTTP 400), skipped 503/429, and could mix models mid tool-call | Fallback chain with retry, per-family config | `gemini-fallback.test.ts`, `test_gemini_resilience.py` |
| 13 | The optional FastAPI service had no crisis handling: only the English word "suicide" as an escalation keyword, no helpline, no Telugu/Hindi/Tamil, no tests. | `core/safety.py` + `core/crisis.py`, run before the rate limit; phrases and replies generated from `safety.ts` into `safety_data.json` | `test_crisis.py` (18), `safety-parity.test.ts` |
| 12 | Stale RLS test suite (26 of 52 passing) while docs said "verified" | Rewritten for the current schema | 69/69 |

## Honesty fixes
Synthetic seed rows no longer cite a real publisher; generated providers are no longer "NCVT Verified" with random phone
numbers; the hard-coded "High Demand" badge on every trade is gone; the cost and security docs were rewritten
with only measured or code-derived figures; the importer no longer promises display it cannot deliver.

## Other
Counsellor queue no longer invents `Class 10` / income bracket for missing data; error text is never returned to the
browser; self-hosted fonts (offline build); `/api/health` is liveness-only publicly and admin-only for diagnostics;
production Dockerfiles; CI; ESLint config; pinned and trimmed Python dependencies (5 unused packages removed); `JWT_SECRET`
added to `.env.example`; native-review sheet in `docs/LANGUAGE_REVIEW.md`.

See `docs/OPEN_DECISIONS.md` for what still needs your judgement.
