import os
from pathlib import Path

from dotenv import load_dotenv
from google import genai

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    raise RuntimeError("GEMINI_API_KEY is not set in the environment")

client = genai.Client(vertexai=True, api_key=api_key)

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Say hello, world!",
)

print(response.text)
