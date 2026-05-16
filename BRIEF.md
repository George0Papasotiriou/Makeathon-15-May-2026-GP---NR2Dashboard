# Hackathon Brief

## The challenge

Build a system that turns **natural-language questions into dashboard components** for chatbot/voicebot analytics data.

A product manager opens your tool and types:

> *"Show me a pie chart of Greek vs English users."*

…and your system returns a working pie chart of language split. Now they type:

> *"How is the bot doing this week?"*

…and your system shows them something useful — maybe a multi-metric overview, maybe a trendline with an annotated anomaly. Not the same chart they got last time.

It should work for **any reasonable question a real ops or product person might ask** — distributions, comparisons, trends, rankings, anomaly hunts, open-ended health checks. In English or Greek.

## What we give you

- **A 90-day synthetic dataset** of ~10,000 banking voicebot conversations as raw nested JSON (`conversations.jsonl`) and as a DuckDB file with flat views ready for SQL (`conversations.duckdb`). Pre-built and committed — every team works from the **same** data.
- **A starter folder** (`starter/`) with a small worked example you can crib from or ignore.
- **A schema doc** and a **metrics dictionary** so every team computes "containment", "CSAT", "AHT" the same way.

## What you build

Anything that takes a natural-language question and produces a dashboard component (or several). The form is up to you: a CLI, a notebook, a Streamlit app, a FastAPI + React frontend, a desktop app, a single Python script, a multi-module package — all fine. Code organization is up to you. Use whatever LLM, chart library, and architecture you want.

A UI is strongly recommended — something that lets a judge type a query and see results live wins.

## Constraints

- You must respect the metric definitions in `data/metrics_dictionary.md`. A dashboard that says "containment" but computes something else is wrong.
- The dataset is the only data source. Use it as-is — do not regenerate, do not modify, do not bring outside data.

## Rules

- Use the dataset as-is. Don't regenerate with different seeds.
- All code must be your own or used under permissive license (MIT/Apache/BSD/etc.) Cite anything you import.
- Pretrained / API-served LLMs are fine. Pre-trained NL-to-SQL adapters are fine. Hand-built lookup tables of "if query contains X return Y" are not allowed.
- Have fun.

> Scoring rubric, deliverables, and submission instructions will be provided separately by the organizers.

Good luck.
