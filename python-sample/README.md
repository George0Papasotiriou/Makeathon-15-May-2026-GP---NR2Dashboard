# Gemini API quickstart

A minimal sample that calls the Gemini API as an LLM via the [`google-genai`](https://pypi.org/project/google-genai/) SDK. See [main.py](main.py).

## Prerequisites

- Python 3.13+
- [uv](https://docs.astral.sh/uv/)

## 1. Get an API key

The API key is provided on request — ask the team for it.

Paste it into [.env](.env):

```
GEMINI_API_KEY=your-key-here
```

> Don't commit the key. `.env` should stay local.

## 2. Install

```bash
uv sync
```

## 3. Run

```bash
uv run main.py
```

Expected output:

```
Hello, world!
```

## Change the model

Edit the `model` argument in [main.py](main.py):

```python
response = client.models.generate_content(
    model="gemini-2.5-flash",  # swap for another Gemini model
    contents="Say hello, world!",
)
```

## If you hit a 429 / `RESOURCE_EXHAUSTED`

This means you've hit a quota or rate limit. Back off and retry with increasing delay rather than hammering the API. Details:

- [Error code 429](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/deploy/error-code-429)
- [Retry strategy](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/retry-strategy)
