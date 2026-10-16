# Security review (implemented controls and what has been verified)

"Verified" below means an automated check ran and passed in this repository's CI. Where a control is
implemented but not independently tested, it says so. This is a self-review, not an external audit.

## Defence in depth

1. **Database (Supabase Postgres)** is the authority. Row-level security, column grants and
   `SECURITY DEFINER` functions decide who can read or change what, regardless of what the app sends.
2. **API routes** validate input shape and length, authenticate, authorise by `staff_roles`, and never
   return raw database error text (`fail()` in `lib/guard.ts` logs it server-side).
3. **Safety path**: the crisis check runs before every limit and gate, makes no LLM call, and only claims
   a counsellor was notified if the urgent ticket really exists.
4. **Browser**: CSP, HSTS, `X-Frame-Options: DENY`, no third-party origins (fonts are self-hosted).

## Verified in CI

| Control | Evidence |
|---|---|
| All 11 migrations apply in order to an empty database | `tools/verify_rls.sh` |
| 69 row-level-security checks (families, two counsellors, a district-restricted counsellor, admin, anon) | `supabase/tests/rls_test.py` |
| Admins cannot read raw family transcripts | RLS check "ADMIN cannot read raw messages" |
| A counsellor restricted to one district cannot see another district's tickets or transcripts | RLS checks for `CFAR` |
| Callback phone is hidden until the counsellor accepts the ticket | RLS checks "phone HIDDEN / VISIBLE" |
| Families cannot forge counsellor or AI messages, reassign sessions, self-assign tickets, or grant themselves roles | RLS checks |
| `user_metadata.role = admin` is ignored | RLS check |
| Admin aggregates suppress small groups (k < 10) | RLS checks |
| API routes only update columns the database grants | `route-contract.test.ts` |
| Counsellor workflow statements the API sends are accepted by the schema | RLS section "exact statements" |
| Malformed or oversized input returns 400, never 500 | `chat-route.test.ts`, `http.test.ts` |
| Phone numbers (all common Indian formats, Indic digits), emails and Aadhaar-style numbers are redacted before the LLM and before storage | `redact.test.ts` |
| Crisis messages reach the helpline at the session cap, over the length limit, with no trade selected, and at the daily quota | `chat-route.test.ts` |
| Hallucinated statistics never enter the transcript | `chat-route.test.ts` |
| The FastAPI service answers distress with the helpline first, in all four languages, from the same source as the Next.js app | `test_crisis.py`, `safety-parity.test.ts` |

## Found and fixed during review

- Admins could read every family's raw chat transcript (policy re-opened by the demo-contract migration).
- Counsellors in any district could read every new ticket (permissive policy overrode district scoping).
- Counsellor `contact`, `resolve` and `close` calls were refused by the database; `close` also contradicted the status machine.
- Live mode never saved `concern_state` or joint-counselling answers (families cannot write those columns).
- `/api/health` was public and revealed configuration, a sample row and raw error text.

## Known limits

- **Rate limiting in the Next.js app is per server instance.** The durable limits are the database quotas
  (100 messages/day, 5 sessions/day per user). The FastAPI service can share counters through Redis.
- `script-src` needs `'unsafe-inline'` because Next.js 14 inlines bootstrap scripts.
- `next@14.2.35` has an open advisory about the image optimizer. The app does not use `next/image` and
  the optimizer is disabled in `next.config.js`. Moving to Next 16 needs React 19 and a retest.
- The RLS suite runs against a stub of Supabase's `auth` schema, not against Supabase itself.
- Live Gemini and Supabase behaviour has not been exercised from this repository (see
  `tools/live_preflight.py`).
- Telugu, Hindi and Tamil crisis text has not had native-speaker review, and the helpline numbers should be
  re-checked against Tele-MANAS before any real deployment.
- Not reviewed by a lawyer; "designed around the DPDP Act" is not a compliance claim.
