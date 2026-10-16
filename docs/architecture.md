# System Architecture & Fallback Tiering

**Document Scope**: Data Access Layers, Service Fallbacks, and Chat Flow Mechanics  
**System**: Parivar Path v17 (Smart India Hackathon PS #26241)

---

## 1. High-Level System Architecture

Parivar Path is built with resilient layered fallback to ensure 100% operational uptime during live demonstrations, offline field conditions, or remote connectivity disruptions.

```
                           +------------------------+
                           |  Next.js 14 Web PWA    |
                           |  (App Router / Client) |
                           +-----------+------------+
                                       |
                   +-------------------+-------------------+
                   |                                       |
                   v                                       v
        +--------------------+                 +--------------------+
        |  Next.js API Edge  |                 |  FastAPI Backend   |
        |  (/api/chat, etc.) |                 |  (Port 8000)       |
        +----------+---------+                 +----------+---------+
                   |                                       |
         +---------+---------+                             |
         |                   |                             |
         v                   v                             v
  +--------------+    +--------------+            +-----------------+
  | Supabase     |    | Google       |            | Local SQLite /  |
  | PostgreSQL   |    | Gemini AI    |            | Seed Fallback   |
  +--------------+    +--------------+            +-----------------+
```

---

## 2. Chat Implementation Mechanics

### Primary Route: Next.js API (`apps/web/src/app/api/chat/route.ts`)
- **Execution**: Server-side Route Handler in Next.js 14 App Router.
- **Role**: Primary production path deployed on Vercel or Node container.
- **Responsibilities**:
  1. Distress signal detection (Tele-MANAS crisis protocol intercept before any LLM prompt assembly).
  2. Rate limiting check (sliding window + database quota trigger).
  3. PII redaction layer (removes 10-digit Indian phone numbers & emails).
  4. Grounding verification against Supabase `outcome_metrics`.
  5. Multi-model Gemini invocation with automatic fallback (`gemini-3.8-flash` $\rightarrow$ `gemini-2.5-flash`).
  6. Number validator scan: verifies any numerical claim against retrieved data. If hallucinated, escalates immediately.

### Fallback Route: FastAPI Service (`services/api/app/routers/chat.py`)
- **Role**: Self-hosted microservice fallback. Used for automated testing, local evaluation benchmarks, and headless deployments.
- **Compatibility**: Mirror logic for concern classification, grounding checks, and escalation workflows.

---

## 3. Three-Tier Data Fallback Chain

When the user queries trades, placement metrics, or schemes:

```
Tier 1: Supabase Direct (Primary Production)
        |  (Active when NEXT_PUBLIC_SUPABASE_URL and credentials exist)
        |  Fetches verified live rows from PostgreSQL with RLS.
        v
Tier 2: FastAPI Backend (/trades, /outcomes)
        |  (Active when FastAPI base URL is configured)
        |  Provides REST access to local sqlite/backend database.
        v
Tier 3: Safe Demo Mode (In-Memory Offline Fallback)
           (Active when NEXT_PUBLIC_FORCE_DEMO_MODE=true or networks offline)
           Uses strictly labelled DEMO_TRADES and demo outcome matrices.
           Guarantees complete UI interactivity without network calls.
```

---

## 4. Tele-MANAS Crisis Safety Priority

In all tiers, crisis and self-harm keywords trigger immediate interception:
1. Crisis check occurs **prior** to any LLM query or demo branch.
2. Returns regional Tele-MANAS helpline numbers (`14416` and `1800-891-4416`).
3. Escalation ticket marked `urgent` with 1-hour SLA.


## Which code path is authoritative (read this before changing chat)

There are two chat implementations. They are intentionally not merged yet:

| Path | Used when | Files |
|---|---|---|
| **Next.js + Supabase** (primary, what Vercel deploys) | `NEXT_PUBLIC_API_URL` is empty | `apps/web/src/app/api/*`, `lib/ai/provider.ts`, `lib/safety.ts` |
| **FastAPI** (optional service; also home of the 60-conversation evaluation and demo scripts) | `NEXT_PUBLIC_API_URL` is set | `services/api/app/*` |

Rules that keep them from drifting: the crisis phrases and reply live in `safety.ts` (the review sheet is generated from it); both Gemini clients use the same model chain (`GEMINI_MODEL`, then `GEMINI_FALLBACK_MODELS`) and the same thinking-config rule; outcome numbers always come from the database, never from the model. A change to either implementation must be mirrored and tested in the other until one is retired.

Data layers: Supabase Postgres (production), SQLAlchemy (FastAPI service), and in-browser demo data (`lib/demo-*.ts`, only when demo mode is on). `apps/web/src/lib/api.ts` is the browser-side client that chooses between them.
