from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    ENV: Literal["development", "production"] = "development"
    LOG_LEVEL: Literal["debug", "info", "warning", "error"] = "info"

    DUCKDB_PATH: Path = Field(
        default=Path(__file__).parent.parent.parent / "data" / "conversations.duckdb"
    )

    CORS_ORIGINS: str = "http://localhost:3000"

    AUTH_KEY: str = ""

    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-4-6"
    GOOGLE_API_KEY: str = ""

    # Gemini Live (voice mode) — AI Studio direct, not Vertex AI.
    VOICE_MODEL: str = "gemini-2.5-flash-native-audio-preview-12-2025"
    VOICE_NAME: str = "Kore"

    SYSTEM_PROMPT_PATH: Path = Field(
        default=Path(__file__).parent / "prompts" / "smartrep_voicebot.txt"
    )

    EDITORIAL_PROMPT_PATH: Path = Field(
        default=Path(__file__).parent / "prompts" / "smartrep_editorial.txt"
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]


settings = Settings()
