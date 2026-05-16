"""VoiceSession dataclass — lightweight per-WS state.

No persistence, no resume, no analytics. Single-fire session that lives
only for the duration of one WebSocket connection.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from fastapi import WebSocket


@dataclass
class VoiceSession:
    session_id: str
    conversation_id: str
    ws: WebSocket
    gemini_session: Any = None
    audio_in_queue: asyncio.Queue[bytes] = field(default_factory=asyncio.Queue)
    audio_out_queue: asyncio.Queue[bytes] = field(default_factory=asyncio.Queue)
    is_active: bool = True
    last_activity: datetime = field(default_factory=lambda: datetime.now(UTC))
    # User-selected canvas context prepended to every question this session
    # routes through Claude. Set via `set_context` WS message from the
    # browser; mirrors what the HTTP path does inline.
    context_prefix: str = ""

    def touch(self) -> None:
        self.last_activity = datetime.now(UTC)
