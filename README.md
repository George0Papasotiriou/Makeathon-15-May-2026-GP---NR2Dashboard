# Natural Language to Dashboard

Welcome.

Your challenge is to build a system that turns natural-language questions into dashboard components, against real-shaped chatbot/voicebot logs.

> *"Show me a pie chart of Greek vs English users."* → working pie chart.
>
> *"How is the bot doing this week?"* → useful multi-component view that surfaces what's actually happening.

## 5-minute setup

```bash
git clone git@github.com:SmartRepOrg/Makeathon-repo.git
cd Makeathon-repo
```

The dataset (`data/conversations.duckdb` and `data/conversations.jsonl`) is **pre-built and committed**. All teams work from the exact same data — please don't try to regenerate or modify it.

If you want to use the example in `starter/`:

```bash
pip install -r starter/requirements.txt
python starter/demo.py
```

## What you read first

| Read | Why |
| --- | --- |
| `BRIEF.md` | The full challenge statement. Scope and constraints. |
| `data/schema.md` | The dataset's column dictionary. The most important reference doc. |
| `data/metrics_dictionary.md` | How "containment", "CSAT", "AHT" etc. are defined. |
| `starter/` | A small worked example you can crib from. Optional. |

> Scoring and submission details will be provided separately by the organizers.

## Repo map

```
.
├── README.md          ← you are here
├── BRIEF.md           ← the challenge
│
├── data/              ← pre-built dataset + docs
│   ├── README.md
│   ├── schema.md
│   ├── metrics_dictionary.md
│   ├── conversations.duckdb   ← the dataset
│   └── conversations.jsonl    ← raw JSONL
│
└── starter/           ← small worked example, optional
    ├── README.md
    ├── demo.py
    ├── requirements.txt
    └── __init__.py
```

Build whatever shape your team wants — single script, multi-module package, web app, notebook, CLI, anything. The repo layout is yours to extend.

## What's possible to build

You have full latitude. Some patterns that work well:

- **Tool-calling**: LLM chooses from `create_pie_chart`, `create_bar_chart`, etc. — reliable, easy to validate, easy to extend.
- **Spec generation**: LLM emits Vega-Lite or a similar declarative spec — flexible, type-safe, renders cleanly.
- **SQL + chart inference**: LLM emits SQL against the DuckDB plus a chart type — pairs naturally with the dataset.
- **Code generation**: LLM emits React/Recharts code, you sandbox-render it — maximum flexibility, biggest blast radius.

The dataset is deliberately rich enough to support all of these. Pick the one your team can ship.

Good luck. Build something you'd actually want to use Monday morning.
