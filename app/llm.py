"""
Gemini 2.5 Flash integration via REST API.
No SDK dependency — works on any Python 3.7+.
"""

import json
import os
import logging
from typing import Any, Dict, List, Optional

import httpx

from app.prompts import SYSTEM_PROMPT, build_prompt

logger = logging.getLogger(__name__)

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"


def _get_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        raise RuntimeError("GEMINI_API_KEY not set. Add it to .env file.")
    return key


async def query_llm(
    question: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    retry_context: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Send a natural-language question to Gemini and get back a structured
    JSON chart specification with SQL.

    Returns parsed JSON dict or raises on failure.
    """
    api_key = _get_api_key()

    user_prompt = build_prompt(question, conversation_history)

    if retry_context:
        user_prompt += f"\n\nPREVIOUS ATTEMPT FAILED: {retry_context}\nPlease fix the SQL and try again."

    payload = {
        "systemInstruction": {
            "parts": [{"text": SYSTEM_PROMPT}]
        },
        "contents": [
            {
                "role": "user",
                "parts": [{"text": user_prompt}]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.15,
            "maxOutputTokens": 4096,
        }
    }

    url = f"{GEMINI_API_URL}?key={api_key}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=payload)

        if response.status_code != 200:
            error_detail = response.text[:500]
            logger.error(f"Gemini API error {response.status_code}: {error_detail}")
            raise RuntimeError(f"Gemini API error {response.status_code}: {error_detail}")

        result = response.json()

    # Extract the text content from Gemini's response
    try:
        text = result["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        logger.error(f"Unexpected Gemini response structure: {result}")
        raise RuntimeError(f"Failed to parse Gemini response: {e}")

    # Parse the JSON
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"Gemini returned invalid JSON: {text[:500]}")
        raise RuntimeError(f"LLM returned invalid JSON: {e}")

    return parsed
