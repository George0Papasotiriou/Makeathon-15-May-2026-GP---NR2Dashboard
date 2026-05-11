# Starter — worked example (optional)

This folder is a small, optional, working example of one way to approach the problem. **You're not required to use it, extend it, or even keep it.** Build whatever you want, in whatever shape you want.

What's here:

- `demo.py` — a tiny end-to-end script: takes a query, picks one of a few hardcoded handlers, runs SQL against the DuckDB, returns a chart spec.
- `requirements.txt` — minimum dep (`duckdb`) to run `demo.py`.
- `__init__.py` — makes this folder a Python package.

## Run it

```bash
pip install -r starter/requirements.txt
python starter/demo.py
```

You should see four example chart outputs print — language pie, top-intents bar, daily-volume line, CSAT KPI. That's it. The point is to show one concrete shape of input → output so you have something to start from if you want.

## Going further

If you keep this example as a base, plausible next steps include replacing the hardcoded router with an LLM, broadening the chart vocabulary, emitting Vega-Lite specs instead of raw `{label, value}` dicts, adding a UI on top.

If you'd rather start fresh in a different language / framework / file layout, do that. Nothing in this folder is sacred.
