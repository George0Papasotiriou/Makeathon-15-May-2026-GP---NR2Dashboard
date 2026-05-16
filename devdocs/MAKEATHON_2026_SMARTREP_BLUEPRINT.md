# UniAI Makeathon 2026 — SmartRep NR2Dashboard Blueprint

> Strategic plan, technical spec, and execution playbook.
> Optimized for 1st place. Solo build with potential pitch/video support.

---

## Table of Contents

1. Mission
2. The Hackathon — Context & Format
3. The Rubric (memorize)
4. Why We Chose SmartRep (vs the other three challenges)
5. The Challenge — Full Brief
6. Strategic Positioning
7. Architecture Overview
8. The Pipeline (text + voice)
9. Chart Architecture — Framework, Not Templates
10. System Prompt Strategy
11. Conversation Refinement Layer
12. Voice Layer (Gemini Live)
13. Evaluation Suite & Metrics
14. UI/UX Direction
15. Tech Stack — Locked
16. Build Discipline & Hour-by-Hour
17. Demo Moment & 10-Minute Presentation
18. 2–3 Minute Demo Video (Capcut, no audio)
19. Code Quality & Production Standards
20. Security (Pragmatic Layers)
21. Documentation Plan
22. Submission Deliverables (GitHub, slides, video)
23. Risk Register & Mitigations
24. Deep Research Prompts (the two we run before/during the build)
25. Quick Reference (one-page TL;DR)

---

## 1. Mission

Win 1st place at UniAI Makeathon 2026 by building the cleanest, most rigorous, most visually coherent natural-language-to-dashboard system in the room, then closing the demo with a voice-controlled tool-calling flourish nobody else will have.

One-line product summary: *Ask your data anything — type it or speak it — get a beautiful chart back, with proof the system works.*

---

## 2. The Hackathon — Context & Format

- **Event:** UniAI Makeathon 2026
- **Venue:** Athens University of Economics and Business (AUEB)
- **Dates:** May 15–17, 2026 (Friday → Sunday)
- **Active build:** ~36 hours
- **Format:** Pick 1 of 3 sponsor challenges (revealed Friday 17:00), build, demo, win
- **Team size:** 4–5 typical; we are solo (with possible random/pitch teammate)
- **Tooling expectations:** organizers provided official Python-heavy tutorials (FastAPI, CrewAI, LangGraph, Pydantic, RAG, Whisper, etc.) — mentor fluency is in this paradigm

### Presentation format
- **10 minutes** presentation + **5 minutes** Q&A
- Recommended structure: Workforce (1m) → Inspiration (1–2m) → The Project + video (4–5m) → Future (2–3m) → Conclusions (1m)
- Q&A will probe technical depth — every architecture choice must be defensible

### Submission deliverables
- Public GitHub repo named `makeathon-2026-[team]-[challenge]` with README, .gitignore, no committed secrets
- 10-slide max presentation
- 2–3 minute demo video (no audio — we narrate live)
- Live deployed URL (we'll use Railway Pro)

---

## 3. The Rubric (memorize)

| Dimension | Weight | Sub-criteria |
|-----------|--------|--------------|
| **Idea** | **40%** | Problem understanding (10%), Innovation & Creativity (20%), Impact & Applicability (10%) |
| **Technical** | **40%** | Technical excellence — algorithms, data handling, **model evaluation quantitative AND qualitative**, AI tool use (30%); Prototype functionality / UI-UX (10%) |
| **Communication** | **20%** | Clear, time-respecting presentation |
| **Bonus** | — | Extra implementation beyond brief |

### Strategic translation
- The **30% technical excellence** is the single biggest sub-criterion. We *must* show proper evaluation methodology — golden sets, accuracy metrics, latency benchmarks, faithfulness checks. ML rigor is not optional.
- The **20% innovation** is where the voice layer and conversational refinement earn their place.
- The **10% prototype** is where polish and aesthetic coherence land.
- The **bonus** is rubric-backed: every "natural useful extension" beyond the brief scores extra.

---

## 4. Why We Chose SmartRep (vs the other three)

| Criterion | Pathfinder (Deloitte) | SmartRep (NR2Dashboard) | I-Sense (Hyperspectral) | Inform (CloudFin/RAG) |
|-----------|------------------------|--------------------------|--------------------------|------------------------|
| Visual ceiling | 5 | 4 | 3 | 4 |
| Weak-competition | 3 | 4 | 5 | 3 |
| Infrastructure-shape | 4 | 5 | 2 | 5 |
| Deploy-Monday | 5 | 5 | 3 | 5 |
| Stack fit | 5 | 5 | 2 | 5 |
| Expansion room | 5 | 5 | 3 | 5 |
| Execution risk (inverted) | 3 | **5** | 2 | 4 |
| Rubric fit (30% technical) | 4 | **5** | 3 | 5 |
| **Total** | 34/40 | **38/40** | 23/40 | 36/40 |

### Why SmartRep wins
- **Pre-built deterministic dataset** — no flaky external APIs, no demo risk at 3am Sunday.
- **Pure technical rigor lane** — SQL generation accuracy, chart-type correctness, latency, grounding can all be measured cleanly.
- **Challenge owner = the actual business they ship** — they will judge with maximum expertise and reward depth.
- **NL-to-dashboard is the hottest enterprise AI category right now** (Hex Magic, Mode Mai, Snowflake Cortex Analyst) — fresher concept than RAG-over-invoices (Inform), which every LangChain tutorial covers.
- **Voice layer expansion** = the unexpected layer judges have not seen all weekend.

---

## 5. The Challenge — Full Brief (SmartRep NR2Dashboard)

### What they want
A system that turns natural-language questions into dashboard components, against real-shaped chatbot/voicebot logs:
- "Show me a pie chart of Greek vs English users." → working pie chart
- "How is the bot doing this week?" → useful multi-component view

### Dataset (pre-built, identical for every team — DO NOT modify)
- `data/conversations.duckdb` — 90-day synthetic dataset, ~10K banking voicebot conversations, flat SQL-ready views
- `data/conversations.jsonl` — same data as raw nested JSON (we will ignore this for our SQL+chart pipeline)
- `data/schema.md` — column dictionary (the single most important reference doc)
- `data/metrics_dictionary.md` — canonical definitions for Containment Rate, CSAT, AHT, etc.
- `starter/demo.py` — small worked example, optional

### Query types we must handle
- Distributions
- Trends
- Rankings
- Anomaly hunts
- Open-ended checks
- In English **and** Greek (values may be Greek; tables/columns are English)

### What's banned
- Hard-coded lookup tables ("if query contains X → return Y")
- Regenerating or modifying the dataset
- External data sources

### What's allowed
- Pretrained & API-served LLMs
- Pre-trained NL-to-SQL adapters
- Any architecture we choose

### Architectures they outline
1. Tool-calling (LLM picks `create_pie_chart`, `create_bar_chart`, etc.)
2. Spec generation (Vega-Lite or similar)
3. **SQL + chart inference** ← we are using a variant of this
4. Code generation (LLM emits Recharts JSX, sandbox-rendered)

### Time budget
- Designed for ~40 hours of active work
- "Web app with chat UI, MCP integration, dynamic browser-rendered charts" is the *Intermediate* tier; "multi-source, follow-ups, deployed" is *Ambitious*. We target Ambitious.

---

## 6. Strategic Positioning

We will be the *only* team that combines all of:

1. **Generalizable SQL generation** (not pattern-matched — works on unseen queries)
2. **Custom chart spec + shadcn-styled primitives** (visual coherence the field will not match)
3. **Conversational refinement** (follow-up queries with context — "now compare to last month")
4. **Voice-controlled tool calling** (Gemini Live closing flourish)
5. **Rigorous evaluation methodology** (golden set, accuracy %, latency, grounding metrics in README and slides)
6. **Production-grade repo** (architecture doc, decision ledger, real-time README, clean commits, deployed URL)

Most teams will ship a Streamlit demo that works on 3 hardcoded queries. We will ship a deployed, evaluated, voice-controlled product with a defensible methodology.

---

## 7. Architecture Overview

```
                    ┌─────────────────────────────────────────────┐
                    │  Next.js 15 + TS + Tailwind + shadcn UI     │
                    │  Linear/Vercel/Attio aesthetic              │
                    │  Chat input · Chart canvas · AI-thinking    │
                    │  side panel (streaming SQL) · Mic button    │
                    └────────────────┬────────────────────────────┘
                                     │
                  ┌──────────────────┴──────────────────┐
                  │                                     │
              text path                            voice path
                  │                                     │
                  ▼                                     ▼
        ┌─────────────────────┐         ┌──────────────────────────────┐
        │ FastAPI backend     │         │ Gemini Live API              │
        │ /query endpoint     │         │ WebSocket, tool calling      │
        │ Claude Sonnet 4.5   │         │ Tools call /query internally │
        │ → JSON spec         │         └──────────────┬───────────────┘
        └────────────┬────────┘                        │
                     │                                 │
                     ▼                                 │
        ┌─────────────────────────┐                    │
        │ Validate SQL            │ ◄──────────────────┘
        │ → execute on DuckDB     │
        │ → fail-retry up to 3x   │
        └────────────┬────────────┘
                     │
                     ▼
        ┌──────────────────────────────────┐
        │ Render chart spec → shadcn       │
        │ chart primitive · animate in     │
        │ Stream SQL char-by-char to       │
        │ side panel as visible "thinking" │
        └──────────────────────────────────┘
```

### Single Railway Pro project
- `frontend` service: Next.js
- `backend` service: FastAPI (Python)
- `data` service: DuckDB file mounted (or in-memory loaded on boot from committed file)
- Internal networking between services; only frontend has public domain
- Continuous deploy from `main`; preview deploys on feature branches

---

## 8. The Pipeline

### Text path (default)
1. User types question in chat
2. Frontend sends to FastAPI `/query` with conversation context
3. Backend builds prompt: system prompt + schema + metrics dictionary + DuckDB capabilities + structural output example + behavioral rules + conversation history
4. Claude Sonnet 4.5 returns JSON: `{ sql, chart_spec, explanation, follow_up_hint?, clarification? }`
5. Backend validates SQL (try-execute, dry run if possible)
6. If SQL fails → retry with error context (max 3 attempts)
7. If still failing → return graceful error with friendly message
8. Execute SQL on DuckDB → get rows
9. Return `{ rows, chart_spec, explanation, sql, latency_ms, token_cost }` to frontend
10. Frontend streams SQL char-by-char to side panel + renders chart with entrance animation + displays explanation in chat

### Voice path (closing flourish, added hour ~24)
1. User clicks mic button → permission granted → Gemini Live WebSocket opens
2. User speaks query
3. Gemini Live transcribes + reasons + calls our registered tool `query_data(question, context)` via tool-calling
4. Tool internally hits the *same* `/query` endpoint with the transcribed question
5. Result flows back through the same renderer
6. Gemini Live optionally speaks a TTS response ("Here's the chart showing containment rate by intent")

The voice layer is the closing flourish, not a parallel system. It uses the existing pipeline via tool calling, so it adds spectacle without doubling our build scope.

---

## 9. Chart Architecture — Framework, Not Templates

### Principle: capabilities, not templates
- We do **not** ship a set of fixed chart templates that map 1:1 to query types.
- We ship a small set of **flexible chart primitives** (React components, shadcn-styled).
- The system prompt describes the *framework* — what primitives exist, what fields they accept, how they compose — and the LLM emits the chart spec freely.
- A generic renderer maps any valid spec to the corresponding primitive(s).
- For outbound / very complex queries, the LLM can compose multiple primitives into a multi-panel view.
- This is fully compliant with SmartRep's no-hardcoding rule and gives the LLM real flexibility.

### Initial primitive set (subject to deep-research refinement)
- `BarChart` (horizontal, vertical, grouped, stacked)
- `LineChart` (single or multi-series, with optional area fill)
- `AreaChart`
- `PieChart` / `DonutChart`
- `KPICard` (single big-number metric, optional trend arrow)
- `Table` (when data is best as rows)
- Possibly: `Heatmap`, `ScatterPlot` (decide after research)

### Chart spec schema (draft — to be finalized after Deep Research 1)

```json
{
  "type": "bar" | "line" | "area" | "pie" | "kpi" | "table" | "heatmap" | "scatter",
  "title": "string",
  "subtitle": "string?",
  "data_field_x": "column_name",
  "data_field_y": "column_name | column_name[]",
  "group_by": "column_name?",
  "agg": "sum" | "avg" | "count" | "median" | "p95" | ...,
  "sort": { "field": "...", "direction": "asc" | "desc" } | null,
  "highlight_threshold": { "value": 85, "above_color": "primary", "below_color": "warning" } | null,
  "annotations": [{ "x": "...", "label": "..." }] | null,
  "layout": "single" | "multi-panel",
  "panels": [<chart_spec>] | null   // for multi-panel views
}
```

### Multi-panel support
When the question is open-ended ("how is the bot doing this week?"), the LLM emits `layout: multi-panel` with an array of sub-charts (e.g., 4 KPI cards on top + a trend line below). Renderer composes them into a responsive grid.

---

## 10. System Prompt Strategy

### Principle: full reference context, zero query-pattern bias
- Give the LLM full reference material (schema, metrics, DuckDB capabilities, output format)
- Do **not** include query-pattern examples (they bias the model toward mimicking specific patterns and underperform on novel queries)
- Do include 2–3 *structural/behavioral* examples (output JSON shape, clarification behavior, refusal behavior) — these shape format/behavior without biasing query patterns

### System prompt structure (English; data values may be Greek but column names and operations remain English)

```
[ROLE]
You are a senior data analyst working on banking voicebot conversation analytics.
Your job is to translate natural-language questions into safe, correct DuckDB SQL
and to choose an appropriate chart specification to visualize the answer.

[CONTEXT — schema]
<full contents of data/schema.md>

[CONTEXT — metrics]
<full contents of data/metrics_dictionary.md>

[CONTEXT — DuckDB capabilities reference]
<descriptive list of DuckDB SQL features available — output of Deep Research 2.
NOT example queries. Just descriptions of what's available: window functions,
date functions, aggregations, CTEs, etc.>

[OUTPUT CONTRACT]
You MUST respond with a single JSON object matching this schema:
{
  "sql": "<DuckDB SQL string>",
  "chart_spec": <chart spec object — see schema>,
  "explanation": "<short, natural-language answer for the user, max 2 sentences>",
  "follow_up_hint": "<optional suggestion for what they might ask next>",
  "clarification_question": "<optional — only if the question is too ambiguous to answer>"
}

[STRUCTURAL EXAMPLE — output shape only, not a query pattern]
<one minimal example showing the JSON structure, with a generic placeholder query>

[BEHAVIORAL RULES]
- Speak naturally to the user. Never expose SQL or technical jargon in the
  "explanation" field. The SQL goes only in the "sql" field.
- If the question is ambiguous (e.g., timeframe unclear), populate
  "clarification_question" instead of guessing. Always ask in plain language.
- If the question cannot be answered from the dataset, set sql to null and
  explain warmly why in "explanation".
- Respect metric definitions exactly as written in the metrics dictionary.
- For open-ended questions ("how is the bot doing?"), emit a multi-panel
  chart spec with the most informative metrics.
- Match the user's language: respond in Greek if they wrote in Greek,
  English otherwise.

[GUARDRAILS]
- Never modify, drop, or insert data — read-only SQL only.
- Never emit hard-coded values that should come from the data.
- If you don't know, say you don't know in "explanation". Do not fabricate.
```

### Why no query-pattern few-shot
The user instinct is correct: query-pattern examples teach the model to mimic those patterns and underperform on novel queries. Without them, the model uses its training-data prior — imperfect but more general. The structural example only shapes the JSON output format, which is what we actually need to lock down.

---

## 11. Conversation Refinement Layer

### What it does
- Persistent context across turns within a session
- "Now compare to last month" understands the previous chart's metric and timeframe
- "Drill into account_status" knows we were looking at containment rate by intent
- "Why is this dropping?" triggers anomaly explanation with sample conversations

### How
- Maintain a session state object on the backend (no DB required — in-memory)
- On each query, include the last 3–5 turns + the last rendered chart spec in the LLM context
- The LLM has full freedom to update vs. replace charts; it can also emit `layout: "comparison"` to render side-by-side before/after
- For drill-down, the LLM can return sample rows alongside the chart spec, displayed in an expandable section

### Edge cases handled
- User switches topic mid-conversation → LLM detects, optionally renders fresh chart
- User asks something orthogonal to current chart → fresh chart, optionally with "want me to keep the previous chart too?" hint

---

## 12. Voice Layer (Gemini Live)

### Why Gemini Live specifically
- Best-in-class real-time voice API (low latency, natural turn-taking, tool calling baked in)
- Existing WebSocket implementation we will port (saves 4–6 hours)
- Gemini handles Greek + English natively

### Architecture
- WebSocket from frontend → Gemini Live with our system prompt + tool definitions
- Tools registered:
  - `query_data(question: str, conversation_context?: str) → { chart_id, summary }`
  - `describe_current_chart(chart_id: str) → string` (for the voice to summarize what's on screen)
  - `clear_dashboard() → bool`
- When Gemini decides to call `query_data`, our frontend calls the FastAPI `/query` endpoint (the same one the text path uses)
- Result feeds back to Gemini, which speaks a TTS summary while the chart renders

### Demo integration
- The voice layer is the **last** thing we build (hour 24+)
- It is the closing flourish of the demo, not the main course
- Fallback plan: pre-recorded clip of the voice interaction in case the live hall microphone fails

---

## 13. Evaluation Suite & Metrics

### Why this matters
30% of the rubric is technical excellence including **quantitative and qualitative model evaluation**. Most teams will skip this entirely. We will turn it into a competitive advantage by shipping a research-paper-grade evaluation section in the README and one slide.

### The golden set
Friday night, before sleeping, curate **30–50 query/answer pairs** by manually exploring the dataset:
- 8–10 distribution queries
- 8–10 trend queries
- 6–8 ranking queries
- 5–7 anomaly queries
- 5–7 open-ended queries
- Mix of English and Greek
- Mix of simple ("how many users?") and complex ("compare containment rate week-over-week for Greek speakers")

For each: the ground-truth SQL, the expected chart type, the expected rough numeric answer.

### Metrics we report
| Metric | What it measures | How we compute |
|--------|------------------|----------------|
| SQL validity | Does the SQL execute without error? | Run it on DuckDB, check for exceptions |
| Result correctness | Does it return the expected rows? | Compare key result fields to ground truth |
| Chart-type appropriateness | Does the chart type match the question's intent? | Manual review against expected chart type (binary) |
| Median end-to-end latency | Speed of the system | Time from request to rendered chart |
| Greek-vs-English performance | Language parity | Same metrics, split by query language |
| Hallucination rate | How often the LLM invents non-existent columns/values | Manual review or LLM-as-judge |
| Token cost per query | Production planning | Sum input + output tokens from API responses |

### Report format
- Markdown table in README
- One slide in the presentation
- Maybe a small grouped-bar chart inside our own dashboard (eat-your-own-dogfood moment)

---

## 14. UI/UX Direction

### Aesthetic
- **Reference set:** Linear, Vercel, Attio, Stripe, Hex, shadcn defaults
- **Not** glass morphism, **not** crypto-edgy, **not** neon
- Restrained, professional, generous whitespace, one accent color (TBD Friday — likely cool blue or muted purple)
- Inter or Geist font
- Subtle motion (framer-motion on chart entrance/exit, smooth transitions on chart updates)
- Dark mode primary, light mode optional polish

### Layout sketch
- Left: chat input + conversation history
- Center: chart canvas (one chart at a time, or grid for multi-panel)
- Right: collapsible "AI thinking" side panel that streams SQL character-by-character as Claude generates it — this is part of the demo spectacle, not user-facing functionality
- Top right: mic button (voice mode toggle, added late)

### Authentication
- **None.** Open URL → start typing. Zero friction. Documented as a deliberate choice in the README ("optimized for evaluation; production would add OAuth").

### Animations
- Chart entrance: 400ms ease-out, slight scale-in + fade
- Chart update (same chart, new data): smooth interpolation between values
- SQL stream: 30–50ms per character (slow enough to read, fast enough to not lag the demo)
- Voice mic active: pulsing ring around the button

---

## 15. Tech Stack — Locked

### Frontend
- Next.js 15 (App Router)
- TypeScript strict, no `any`
- Tailwind CSS
- shadcn/ui
- Chart primitives: TBD by Deep Research 1 (current default: shadcn charts based on Recharts; alternatives Tremor, Visx, Apache ECharts under evaluation)
- framer-motion for animations
- Zod for runtime validation at every API boundary

### Backend
- FastAPI (Python 3.11+)
- DuckDB (via `duckdb` Python package, in-process)
- Anthropic SDK for Claude Sonnet 4.5
- Google `google-generativeai` SDK for Gemini Live (later)
- Pydantic models for typed request/response
- `python-dotenv` for env management

### Database
- DuckDB only (provided file)
- No external DB needed — dataset is the database

### LLMs
- **Text path:** Claude Sonnet 4.5 via Anthropic API (strongest at structured output + reasoning + tool calling)
- **Voice path:** Gemini Live API with tool calling (existing WebSocket implementation to port)

### Deploy
- Railway Pro
- Single project, multi-service (frontend + backend), internal networking
- DuckDB file committed to repo (~5–20MB synthetic data, fits)
- Public URL on frontend service only

### Dev tooling
- pnpm for frontend, uv or pip for Python
- Git with descriptive commits, feature branches
- Continuous deploy from `main`
- DECISIONS.md ledger updated every time we kill or pivot something

---

## 16. Build Discipline & Hour-by-Hour

### Phase 1 — Setup & exploration (hours 0–4)
- **0:00–0:30** — Lock challenge, scope, design mode. Sketch architecture on paper. Name the demo moment explicitly.
- **0:30–1:00** — Initialize repo with naming convention, push first commit to Railway, confirm deploy works (deploy-from-empty).
- **1:00–4:00** — Manual dataset exploration: read `schema.md`, read `metrics_dictionary.md`, run 20+ exploratory SQL queries by hand to deeply understand the data. Document key findings in `DATA_NOTES.md`. *This is the most important phase — judges will probe data understanding in Q&A.*

### Phase 2 — Core text path (hours 4–12)
- Frontend skeleton with chat input + chart canvas + AI-thinking side panel
- FastAPI `/query` endpoint
- System prompt v1 (schema + metrics + minimal DuckDB capabilities)
- Single chart type working end-to-end (start with bar chart)
- Deploy to Railway, verify live URL
- 5 baseline queries working

### Phase 3 — Coverage & robustness (hours 12–20)
- All 6 chart primitives implemented (Bar, Line, Area, Pie, KPI card, Table)
- All 5 query types working (distribution, trend, ranking, anomaly, open-ended)
- SQL retry-on-error logic (3 attempts max)
- Multi-panel layout for open-ended queries
- Greek language testing + prompt refinement
- UI polish pass

### Phase 4 — Conversational refinement (hours 20–24)
- Session state on backend
- Last 3–5 turns + last chart spec passed to LLM context
- "Now compare to..." style follow-ups working
- Drill-down with sample conversation display

### Phase 5 — Voice layer (hours 24–28)
- Port existing Gemini Live WebSocket implementation
- Register tools, point them at `/query`
- Voice mic button, recording UX, voice → chart flow
- Test with backup pre-recorded clip prepared

### Phase 6 — Evaluation suite (hours 28–32)
- Run golden set through the system, log all metrics
- Build evaluation results table (markdown + slide)
- Finalize README with full Setup, Architecture, Methodology, Evaluation, Limitations sections
- Architecture diagram (mermaid)

### Phase 7 — Demo prep (hours 32–35)
- 2–3 min demo video recorded in Capcut (2x speed capture, 50% slowdown post)
- 10-slide pitch deck
- Rehearse live narration over video 5 times
- Pre-flight checklist drafted

### Phase 8 — Freeze (hours 35–36)
- No new code. No new features. No new dependencies.
- Final read-through of README, DECISIONS.md, ARCHITECTURE.md
- Sleep if possible
- Arrive at presentation rested

### Hard rules (enforced)
- No new dependencies after hour 12
- No architecture changes after hour 20
- Feature freeze hour 28
- Every Claude Code task ends with a verification step (build passes, types pass, browser test)
- Git revert on breakage, never debug forward into chaos
- TODO.md captures derailment ideas without touching them mid-build
- DECISIONS.md ledger updated as choices are made

---

## 17. Demo Moment & 10-Minute Presentation

### The "moment" (the 8-second clip people share after)
The character-by-character SQL streaming in the side panel as the chart simultaneously renders. The audience can *see the AI thinking*. Combined with the closing voice flourish — click mic, speak query, chart appears — this is two moments in one demo.

### 10-minute structure
- **Workforce (1 min)** — who I am, what role, solo execution by choice (mention the discipline of running a one-person org)
- **Inspiration (1–2 min)** — the problem: every business has data, almost nobody can actually ask it questions. The recent enterprise category (Hex Magic, Mode Mai, Cortex Analyst) shows the pattern but is all closed-source enterprise SaaS. We built an open, deployable, voice-enabled version in 36 hours.
- **The Project (4–5 min) — video plays here, I narrate live**
  - Open: dashboard at rest
  - Type "show containment rate by intent this week" → SQL streams, chart appears
  - "Now break by language" → chart transitions
  - "Any anomalies?" → AI flags dip, drills into sample conversations
  - **Click mic. Speak: "Compare CSAT for English vs Greek users last month."** Chart appears.
  - Cut to evaluation table: 92%+ accuracy on 50-query golden set, sub-2s median latency, zero hallucinations on out-of-scope queries
- **Future (2–3 min)** — multi-dataset support, conversational dashboard versioning, on-prem deploy, custom metric definitions, integration with the SmartRep platform itself, what we'd change with 3 more days
- **Conclusions (1 min)** — what we learned, what surprised us, thanks
- **Q&A (5 min)** — defend every architecture choice, evaluation methodology, limitations honestly

### Pre-flight checklist (20 min before stage)
- Refresh deployed URL, confirm warm
- Confirm seed/demo state if applicable
- Mute laptop notifications + sleep mode off
- Backup voice clip ready on second tab
- Water, deep breath, walk to stage

---

## 18. 2–3 Minute Demo Video (Capcut, no audio)

### Structure
- **0:00–0:05** — Hero frame: clean dashboard at rest, our logo subtle
- **0:05–1:30** — Core flow: text query → SQL streaming → chart appearing → follow-up → multi-panel
- **1:30–2:15** — The unexpected layer: voice query → chart appearing
- **2:15–2:30** — Evaluation table or final hero frame

### Production rules
- 1080p (or 720p if file size insists)
- Clean background, no notifications, no other apps visible
- Record at 2x speed, slow to 50% in Capcut → smooth cursor motion that looks like Apple keynote
- Click-zoom on every interaction (Capcut has this)
- No audio in the file (we narrate live)
- Subtle padding/gradient background around the recorded window

---

## 19. Code Quality & Production Standards

### TypeScript
- Strict mode on
- No `any`, ever (use `unknown` + narrowing if needed)
- Zod schemas for every API boundary, env var, LLM output
- Single-responsibility files (easier for Claude Code to edit cleanly)
- Named exports preferred
- Comments explain *why*, not *what*
- Discriminated union types for error handling at boundaries

### Python (FastAPI)
- Pydantic v2 models for all request/response types
- Type hints everywhere
- `try`/`except` at every external boundary (LLM call, DuckDB query, file IO)
- Errors as typed exceptions, never bare `except`
- Structured logging (not `print`)
- No magic strings — constants extracted to a `constants.py`

### Repo hygiene
- `.env.example` committed with all keys blank
- `.env.local` and `.env` in `.gitignore` and verified before first commit
- Server-side API keys only — *never* in the client bundle
- Rate limit on `/query` endpoint (upstash/ratelimit pattern or in-memory token bucket)
- CORS tight to the deployed frontend domain
- HTTPS-only (Railway default)
- Don't log raw user queries or LLM outputs containing potential PII
- Clean commit messages, descriptive branch names

### Sprint discipline
- No new dependencies after hour 12
- No architecture changes after hour 20
- Feature freeze hour 28
- Continuous deploy from `main`
- `TODO.md` for derailment ideas — never touch mid-build
- `DECISIONS.md` for kills, pivots, tradeoffs

---

## 20. Security (Pragmatic Layers)

We are not paranoid for a hackathon, but we ship layered basics that make the repo look professional to judges browsing it.

- **Server-side API keys only.** Anthropic + Gemini keys never reach the browser bundle.
- **Zod / Pydantic at every input boundary.** No raw strings flow into prompts unsanitized.
- **Rate limiting.** Public `/query` endpoint capped at e.g. 30 req/min per IP.
- **Read-only SQL.** System prompt + post-generation guardrail to refuse any non-SELECT statements. (Bonus: a SQL parser checks for forbidden keywords like `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ATTACH`.)
- **Prompt injection awareness.** Clear separation of system/user roles. User input never overrides system instructions.
- **CORS** locked to our frontend origin.
- **HTTPS-only** via Railway default.
- **No PII in logs.** Even though dataset is synthetic, treat it as if real.

What we skip at hackathon scale: full RBAC, audit logs, intrusion detection, pentesting. The visible layers are enough to look professional.

---

## 21. Documentation Plan

### Real-time docs (updated as features land, never at the end)
- **README.md** — Problem, approach, run locally, env vars, architecture, evaluation results, limitations, future work, license
- **ARCHITECTURE.md** — System diagram (mermaid), data flow, deploy topology, key tech choices with rationale
- **DECISIONS.md** — Decision ledger: what we considered, what we chose, what we killed and why
- **DATA_NOTES.md** — What we learned from manual dataset exploration (Phase 1)
- **EVALUATION.md** (or section in README) — Golden set methodology, metrics, results, error analysis, known weaknesses
- **TODO.md** — Derailment-idea graveyard

### README structure (judges read this)
```
# SmartRep — Natural Language to Dashboard
Brief one-paragraph description + live URL

## Problem & Approach
What we built, why this architecture

## Quick Start
git clone, env setup, run locally

## Architecture
Diagram + brief tech-choice rationale

## Evaluation
Methodology + results table + sample queries

## Limitations
Honest list (judges respect this)

## Future Work
Where this could go in 3 more days

## License
MIT
```

---

## 22. Submission Deliverables

### GitHub repo (mandatory)
- **Name:** `makeathon-2026-[team-name]-smartrep` (per organizer convention)
- **Public**, with permissive license (MIT)
- README, .gitignore, .env.example, no committed secrets (verified)
- Clean commit history, descriptive messages, branches
- DECISIONS.md, ARCHITECTURE.md, EVALUATION.md or sections
- Architecture diagram (mermaid in README)
- Screenshots in README

### Presentation (max 10 slides)
1. Title + team
2. Problem & inspiration
3. What we built (one sentence + screenshot)
4. Architecture diagram
5. Demo video plays (4–5 minutes of total presentation time)
6. Evaluation results (the metrics table)
7. The voice layer (the unexpected piece)
8. Limitations + what we'd do with more time
9. Conclusions
10. Thanks / Q&A

Heavy on visuals, near-zero text. Slides are backup vocals to the demo and live narration.

### Demo video (2–3 min, no audio)
Per Section 18.

### Live URL
Railway Pro deployment, warm 24/7 (no cold starts during judging).

---

## 23. Risk Register & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SQL hallucinations (wrong columns, bad aggs) | Medium | High | Try-execute → catch → retry with error context (max 3); SQL parser guardrail; report rate in evaluation |
| Voice live-demo failure (mic, hall noise) | Medium | Medium | Pre-recorded backup clip ready; rehearse switch in pre-flight |
| Greek language quality dropoff | Medium | Medium | Test all 3 candidate models on Greek queries by hour 6; pick strongest; explicit prompt patterns for Greek |
| Open-ended queries returning weird charts | High | Medium | Multi-panel fallback in spec; "I'm not sure what you want — here are the most relevant views" pattern |
| Demo dataset misunderstanding | Low | High | Phase 1 = 4 hours of manual exploration; DATA_NOTES.md captures findings; sanity-check ground truth manually |
| Solo execution fatigue at hour 30 | High | Medium | Architecture freeze hour 20; feature freeze hour 28; sleep at hour 28 if possible |
| Chart-type wrongness for novel queries | Medium | Medium | Generous primitive set; multi-panel layout fallback; evaluation surfaces this rate |
| Railway deploy break at hour 35 | Low | High | Continuous deploy from hour 1; never save deploys for the end; preview branches for risky merges |
| Mic permissions / browser audio issues | Medium | Medium | Test in the actual room Friday evening; backup laptop ready; pre-recorded fallback |
| Dataset values in Greek confusing query results | Medium | Low | Note in DATA_NOTES.md; surface in evaluation; not a blocker since columns are English |

---

## 24. Deep Research Prompts

We run two deep-research streams before/during the build. Both can be pasted into Claude/GPT in Deep Research mode. They are intentionally detailed so the research is rigorous and the output is directly usable.

---

### Deep Research Prompt 1 — Charting & Frontend Tooling for LLM-Generated Dashboards

```
GOAL
I'm building a natural-language-to-dashboard system for a 36-hour hackathon. An LLM
emits a structured JSON chart specification, and a Next.js + Tailwind + shadcn/ui
frontend renders the chart with maximum aesthetic polish (target: Linear, Vercel,
Attio, Stripe — clean corporate analytics aesthetic). I need to choose the best
chart library/approach for this LLM-driven dynamic-spec architecture.

YOUR TASK
Produce a deep, structured comparison and a final recommendation.

LIBRARIES & APPROACHES TO COMPARE
1. shadcn charts (Recharts wrapper with shadcn theming)
2. Tremor (tremor.so) — React analytics components
3. Visx (Airbnb)
4. Nivo
5. Apache ECharts (via echarts-for-react)
6. Vega-Lite (via react-vega)
7. Recharts (raw)
8. Plotly (react-plotly.js)
9. Chart.js (react-chartjs-2)
10. Observable Plot
11. Custom JSON spec + handcrafted shadcn chart primitives

FOR EACH, EVALUATE
- Default aesthetic quality (does it look like Linear/Vercel out of the box, or does it look "library-default ugly"?)
- Animation quality (chart entrance, value transitions, between-chart morphing)
- LLM-spec-friendliness: how easy is it for an LLM to emit a valid spec? How brittle is the syntax? How forgiving is the renderer?
- Customization depth (can I match shadcn theming exactly? Can I use my CSS variables?)
- Bundle size impact in a Next.js production build
- Type safety / TypeScript support
- Maintenance status, last release, community size
- Ecosystem (plugins, extensions, integrations)
- Specific support for: bar (horizontal, vertical, grouped, stacked), line (multi-series, with area), area, pie/donut, scatter, heatmap, KPI cards, tables, multi-panel layouts

KEY QUESTIONS
1. What chart spec format minimizes LLM error rate while maximizing flexibility?
   Compare Vega-Lite spec vs custom schema vs tool-calling enum.
2. How do production NL-to-dashboard products (Hex Magic, Mode Mai, Snowflake
   Cortex Analyst, Outerbase, AskAI) structure their chart layer? What do they
   render? What spec do their LLMs emit?
3. What is the right primitive set for a banking voicebot analytics dashboard
   that must handle: distributions, trends, rankings, anomaly hunts, open-ended
   "how is the bot doing?" overviews?
4. How should multi-panel layouts work? (e.g., 4 KPI cards on top + a trend
   line below + a sortable ranking table on the right.)
5. What are the best practices for animating between chart states when a user
   asks a follow-up that changes the underlying data?
6. How should the system handle ambiguous chart selection (multiple chart
   types could legitimately answer the question)?
7. What's the cleanest way to render an "AI thinking" side panel that streams
   SQL character-by-character alongside the chart canvas?
8. For Greek + English data labels and titles, are there i18n considerations
   per library?

CONSTRAINTS
- Next.js 15 App Router, TypeScript strict, Tailwind, shadcn/ui already chosen
- Solo developer, 36-hour total budget, ~10 hours allocated to UI work
- Aesthetic target is Linear / Vercel / Attio (corporate clean), NOT crypto / NOT glass-morphism
- Bundle size matters (deploy on Railway with reasonable cold-start)
- SmartRep challenge rules: NO hardcoded "if query X → chart Y" patterns
- Chart spec is generated by Claude Sonnet 4.5

OUTPUT FORMAT
1. Ranked recommendation (top 3) with detailed reasoning
2. The proposed chart spec JSON schema (full, with all field options)
3. Example renderer code pattern (TypeScript) showing how the chosen approach
   maps spec → component
4. Specific gotchas / known issues for the top choice
5. Decision tree: "if A is true, use X; if B, use Y"
```

---

### Deep Research Prompt 2 — LLM-to-SQL + DuckDB Capabilities for Analytics

```
GOAL
I'm building a natural-language-to-SQL pipeline for a banking voicebot analytics
dataset (~10K conversations, 90 days, English + Greek values, English column names)
stored in DuckDB. Claude Sonnet 4.5 generates SQL from natural-language questions;
the SQL is executed on DuckDB and the results are visualized. I need (a) deep
understanding of LLM-to-SQL production patterns from leading systems, and (b) a
complete capabilities reference for DuckDB SQL that I can include in my LLM
system prompt as descriptive documentation (NOT as example queries — I'm avoiding
query-pattern bias).

YOUR TASK
Produce two interlocking deliverables: a production-patterns digest, and a
DuckDB SQL capabilities reference suitable for inclusion in a system prompt.

PART A — LLM-TO-SQL PRODUCTION PATTERNS

Investigate how these systems handle NL-to-SQL:
- Hex Magic
- Mode Mai
- Snowflake Cortex Analyst
- Vanna AI
- Outerbase
- AskAI / askYourData-style tools
- Microsoft's Q&A in Power BI
- Defog.ai
- Open-source: WrenAI, Dataherald, sqlchat

For each (where information is available), report:
- Architecture pattern (prompt-only, RAG over schema, fine-tuned, agent-based)
- Validation strategy (dry-run, semantic checks, retry loops)
- How they handle: ambiguous queries, multi-step queries, joins across multiple
  tables, time-series queries, anomaly detection requests, follow-up queries
- How they present results back (text only, table, chart, mixed)
- Error recovery patterns
- Token budget management
- Greek / non-English language handling (if any info available)

QUESTIONS I NEED ANSWERED
1. What is the best system-prompt structure for SQL generation? Is it
   ROLE → SCHEMA → CAPABILITIES → OUTPUT_FORMAT → RULES → (no examples)?
   Or something else?
2. Few-shot vs zero-shot for SQL: I want to AVOID query-pattern examples
   because they bias the model toward mimicking specific patterns. What's
   the consensus? Are there structural/behavioral examples that help without
   introducing query-pattern bias?
3. How should I handle "open-ended" queries like "how is the bot doing this
   week?" where the right answer is multiple charts, not a single SQL query?
   Multi-query plans? Single complex SQL with multiple aggregations?
4. Common failure modes for Claude Sonnet 4.5 specifically on SQL generation:
   any documented weaknesses? Hallucinated columns? NULL handling? Window
   function bugs?
5. Best practices for SQL validation and retry. Should I:
   (a) Try-execute and retry with error context?
   (b) Parse SQL AST first and validate column references?
   (c) Use a separate validator LLM?
   What's the right blend for production-quality output?
6. How should the LLM handle a question where it genuinely can't answer
   from the data? (Refusal vs hedge vs ask-for-clarification.)
7. Token budget: at what dataset complexity does it make sense to RAG over
   the schema vs include full schema in system prompt? My schema is small
   (~20–30 columns, one main table + views). Full inclusion vs RAG?
8. How should I handle conversational follow-ups ("now compare to last
   month")? Pass the previous query? Pass the previous result? Both? How
   far back in history?
9. Greek language handling: does Claude Sonnet 4.5 generate correct SQL
   when the user asks in Greek? Any known prompt patterns that help? Should
   I translate Greek to English first?
10. Production cost considerations: how do leading systems manage cost per
    query at scale?

PART B — DUCKDB SQL CAPABILITIES REFERENCE

Produce a comprehensive, descriptive capabilities reference for DuckDB
v0.10+ suitable for inclusion in an LLM system prompt. NOT example queries.
Descriptive prose plus structured lists, organized so the LLM can discover
what's available without being biased toward specific patterns.

Cover:
- Aggregate functions (SUM, AVG, COUNT, MEDIAN, PERCENTILE_CONT, MODE, etc.)
- Statistical functions (STDDEV, VAR, CORR, COVAR, etc.)
- Window functions (ROW_NUMBER, RANK, DENSE_RANK, LAG, LEAD, FIRST_VALUE,
  LAST_VALUE, NTILE, sliding windows)
- Date/time functions (date_trunc, date_part, date_diff, age, current_date,
  interval arithmetic, time zone handling, generate_series for dates)
- String functions (regex_matches, regex_extract, like patterns, levenshtein,
  string_split, concat_ws, lower, upper, trim, position, substring)
- JSON functions (json_extract, ->, ->>, json_array_elements, jsonb-like
  operations — what DuckDB supports)
- CTEs and recursive CTEs
- PIVOT / UNPIVOT
- QUALIFY clause (window-function filtering)
- Sampling (SAMPLE, USING SAMPLE)
- Approximate aggregation (approx_count_distinct, approx_quantile)
- LIST functions (DuckDB's array type)
- STRUCT type and its access patterns
- Joins (INNER, LEFT, RIGHT, FULL, CROSS, USING, NATURAL, ASOF — DuckDB
  has ASOF JOIN, useful for time-series)
- GROUP BY ALL, GROUP BY GROUPING SETS, CUBE, ROLLUP
- ORDER BY ALL, ORDER BY NULLS FIRST/LAST
- LIMIT with OFFSET, FETCH FIRST
- VALUES clause as a source
- Common Table Expressions chained
- Set operations (UNION, INTERSECT, EXCEPT, and their ALL variants)
- Reading from JSON/CSV/Parquet directly via read_json_auto, read_csv_auto,
  read_parquet (probably not relevant for our use case but worth noting)

For each capability area, provide:
- Brief descriptive paragraph (what it does, when it's useful)
- The function/syntax name
- Type signature where helpful
- Any gotchas or DuckDB-specific behavior
- NO example queries (we are avoiding query-pattern bias)

OUTPUT FORMAT
1. Production patterns digest (Part A): a structured report
2. DuckDB capabilities reference (Part B): a clean markdown doc that I can
   paste directly into the system prompt
3. Recommendations for my specific architecture:
   - System prompt structure (sections, order)
   - Validation and retry strategy
   - Conversational follow-up handling
   - Greek language strategy
   - Token budget plan
```

---

## 25. Quick Reference (one-page TL;DR)

**What we're building:** NL-to-dashboard analytics on the SmartRep duckdb dataset, with conversational follow-ups and a voice closing flourish.

**Stack:** Next.js + TS + Tailwind + shadcn (frontend) // FastAPI + Python + DuckDB (backend) // Claude Sonnet 4.5 (text) + Gemini Live (voice) // Railway Pro deploy.

**Pipeline:** Question → LLM → JSON `{ sql, chart_spec, explanation, clarification? }` → validate+retry → execute on DuckDB → render with shadcn chart primitives → stream SQL char-by-char in side panel.

**Charts:** Framework with primitives, NOT templates. LLM composes freely. Multi-panel for open-ended questions.

**System prompt:** Schema + metrics dictionary + DuckDB capabilities (descriptive) + structural output example + behavioral rules. **Zero query-pattern examples** (to avoid bias).

**Voice:** Closing flourish at hour ~24. Gemini Live with tool calling, tools point at the same `/query` endpoint.

**Evaluation:** 30–50 query golden set Friday night. SQL validity %, chart-type accuracy %, latency, Greek/English parity. Report in README + slide.

**Aesthetic:** Linear/Vercel/Attio clean. No auth. Dark mode primary. Subtle motion. Generous whitespace.

**Discipline:** No new deps after hr 12. No architecture changes after hr 20. Feature freeze hr 28. Continuous deploy from hr 1. Sleep at hr 28 if possible.

**Demo moment:** Type query → SQL streams → chart appears → follow-up → multi-panel → mic button → voice query → chart appears → evaluation table reveal.

**Submission:** Public repo + 10 slides + 2-3min no-audio video + live URL + clean README with evaluation results.

**Goal:** 1st place. Win on rigor + design coherence + the voice flourish + a deployed product nobody else can match.

---

*Document version: v1 — pre-build. Will be updated during the sprint as decisions are made and trade-offs realized.*
