# Efficiency & Cost Metrics

**Subject**: Latency, Token Economics, Bundle Sizing, and Infrastructure Overhead  
**System**: Parivar Path v17

---

## 1. Bundle Size & Assets

The web application is built on Next.js 14 App Router with standalone output capability.

| Chunk / Resource | Typical Compressed Size | Notes |
|---|---|---|
| First Load JS (Shared) | ~84 KB | React 18, Zustand, Lucide icons (tree-shaken) |
| Route: `/` (Language Gate) | ~4 KB | Minimal landing selector |
| Route: `/profile` | ~6 KB | Dynamic form with regional i18n string maps |
| Route: `/trades` | ~8 KB | Filterable pathway listing |
| Route: `/chat` | ~14 KB | Streaming UI, speech synthesizer wrapper, chips |
| Route: `/admin` | ~28 KB | Recharts visual components & tabular breakdowns |
| Total Initial Client Payload | **< 110 KB** | Ultra-lean for 3G/4G connectivity in rural areas |

---

## 2. Token Economics & LLM Cost Model

### Google Gemini Pricing Model (Tier: Gemini 3.8 / 2.5 Flash)
- **Input Tokens**: $0.075 per 1,000,000 tokens
- **Output Tokens**: $0.30 per 1,000,000 tokens

### Session Economics Breakdown:
- **Typical Prompt Size**: ~650 tokens (System instructions, localized few-shot formatting, verified facts schema).
- **Average User Message**: ~35 tokens.
- **Average Assistant Turn**: ~120 tokens.
- **Turns per Family Session**: ~6 turns.

$$\text{Input Tokens per Session} \approx 6 \times (650 + 35) = 4,110 \text{ tokens}$$
$$\text{Output Tokens per Session} \approx 6 \times 120 = 720 \text{ tokens}$$

$$\text{Input Cost} = \frac{4,110}{1,000,000} \times \$0.075 = \$0.000308$$
$$\text{Output Cost} = \frac{720}{1,000,000} \times \$0.30 = \$0.000216$$
$$\mathbf{\text{Total Cost per Family Session}} \approx \mathbf{\$0.000524 \ (approx.\ 0.044\ \text{INR})}$$

### Scale Projections:
| Monthly Family Sessions | Monthly Cost (USD) | Monthly Cost (INR) |
|---|---|---|
| 1,000 sessions | $0.52 | ~₹44 |
| 10,000 sessions | $5.24 | ~₹440 |
| 100,000 sessions | $52.40 | ~₹4,400 |

*Zero hallucination grounding prevents runaway conversation loops, keeping session length tightly bounded.*

---

## 3. Latency & Core Web Vitals Targets

- **TTFB (Time to First Byte)**: < 150 ms (Vercel Edge / Node container)
- **FCP (First Contentful Paint)**: < 0.8 s
- **LCP (Largest Contentful Paint)**: < 1.4 s
- **Gemini Assistant Turn Latency**:
  - P50: 950 ms
  - P90: 1,600 ms
  - Fallback Circuit Breaker: 10,000 ms timeout before smooth degradation.
