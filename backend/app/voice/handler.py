"""Voice WebSocket handler.

Four asyncio tasks under one TaskGroup, all sharing one VoiceSession:
  - audio_input_loop: browser PCM → Gemini realtime input
  - audio_output_loop: queued Gemini audio bytes → browser binary frames
  - gemini_response_loop: Gemini stream → audio queue / transcripts / tool calls
  - browser_message_loop: browser WS → audio_in_queue / text input / end signal

Cancelling any task tears down the others. The session ends on:
  - explicit `end_session` from browser
  - browser disconnect (WebSocketDisconnect)
  - 60s of no audio in either direction (idle safety)
  - Gemini stream end / error
"""

from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from google.genai.types import Blob, FunctionResponse, LiveClientToolResponse

from app.logger import get_logger
from app.voice.client import build_live_connect_config, create_gemini_client
from app.voice.session import VoiceSession
from app.voice.tools import execute_query_data

log = get_logger("voice.handler")

IDLE_TIMEOUT_SECONDS = 60.0
AUDIO_IN_MIME_TYPE = "audio/pcm;rate=16000"


async def handle_voice_ws(websocket: WebSocket, conversation_id: str) -> None:
    await websocket.accept()
    session = VoiceSession(
        session_id=str(uuid.uuid4()),
        conversation_id=conversation_id or str(uuid.uuid4()),
        ws=websocket,
    )

    log.info(
        "Voice session opening",
        extra={"session_id": session.session_id, "conversation_id": session.conversation_id},
    )

    try:
        client = create_gemini_client()
    except RuntimeError as e:
        await websocket.send_json({"type": "session_error", "message": str(e)})
        await websocket.close()
        return

    from app.settings import settings

    last_audio_activity = time.monotonic()

    try:
        async with client.aio.live.connect(
            model=settings.VOICE_MODEL,
            config=build_live_connect_config(),
        ) as gemini_session:
            session.gemini_session = gemini_session
            await websocket.send_json({
                "type": "session_started",
                "session_id": session.session_id,
                "conversation_id": session.conversation_id,
            })
            log.info("Gemini Live session opened", extra={"session_id": session.session_id})

            async def audio_input_loop() -> None:
                nonlocal last_audio_activity
                while session.is_active:
                    try:
                        chunk = await asyncio.wait_for(
                            session.audio_in_queue.get(), timeout=5.0
                        )
                    except asyncio.TimeoutError:
                        if time.monotonic() - last_audio_activity > IDLE_TIMEOUT_SECONDS:
                            log.info(
                                "Voice idle timeout",
                                extra={"session_id": session.session_id},
                            )
                            session.is_active = False
                            try:
                                await websocket.send_json({
                                    "type": "session_ended",
                                    "reason": "idle_timeout",
                                })
                            except Exception:
                                pass
                            return
                        continue
                    last_audio_activity = time.monotonic()
                    session.touch()
                    await gemini_session.send_realtime_input(
                        audio=Blob(data=chunk, mime_type=AUDIO_IN_MIME_TYPE),
                    )

            async def audio_output_loop() -> None:
                nonlocal last_audio_activity
                while session.is_active:
                    try:
                        chunk = await asyncio.wait_for(
                            session.audio_out_queue.get(), timeout=5.0
                        )
                    except asyncio.TimeoutError:
                        continue
                    last_audio_activity = time.monotonic()
                    try:
                        await websocket.send_bytes(chunk)
                    except Exception as e:
                        log.warning(
                            "send_bytes failed; closing",
                            extra={"session_id": session.session_id, "error": str(e)},
                        )
                        session.is_active = False
                        return

            async def gemini_response_loop() -> None:
                async for response in gemini_session.receive():
                    if not session.is_active:
                        return
                    if getattr(response, "tool_call", None):
                        await _handle_tool_call(response.tool_call, session)
                        continue

                    server_content = getattr(response, "server_content", None)
                    if server_content is None:
                        continue

                    # Audio chunks come via model_turn.parts[].inline_data
                    model_turn = getattr(server_content, "model_turn", None)
                    if model_turn is not None:
                        for part in getattr(model_turn, "parts", []) or []:
                            inline = getattr(part, "inline_data", None)
                            if inline is not None and inline.data:
                                await session.audio_out_queue.put(inline.data)

                    in_t = getattr(server_content, "input_transcription", None)
                    if in_t is not None and getattr(in_t, "text", None):
                        await websocket.send_json({
                            "type": "transcript",
                            "source": "user",
                            "text": in_t.text,
                        })

                    out_t = getattr(server_content, "output_transcription", None)
                    if out_t is not None and getattr(out_t, "text", None):
                        await websocket.send_json({
                            "type": "transcript",
                            "source": "agent",
                            "text": out_t.text,
                        })

                    if getattr(server_content, "interrupted", False):
                        # Drain queued agent audio; tell browser to stop playback.
                        while not session.audio_out_queue.empty():
                            try:
                                session.audio_out_queue.get_nowait()
                            except asyncio.QueueEmpty:
                                break
                        await websocket.send_json({"type": "interrupted"})

                    # End-of-turn marker — browser uses this to auto-close
                    # the session shortly after a chart push, instead of
                    # waiting on amplitude heuristics.
                    if getattr(server_content, "turn_complete", False):
                        await websocket.send_json({"type": "turn_complete"})

            async def browser_message_loop() -> None:
                while session.is_active:
                    try:
                        msg = await websocket.receive()
                    except WebSocketDisconnect:
                        log.info(
                            "Browser disconnected",
                            extra={"session_id": session.session_id},
                        )
                        session.is_active = False
                        return

                    if msg.get("type") == "websocket.disconnect":
                        session.is_active = False
                        return

                    if "bytes" in msg and msg["bytes"] is not None:
                        await session.audio_in_queue.put(msg["bytes"])
                        continue

                    if "text" in msg and msg["text"] is not None:
                        import json as _json

                        try:
                            payload = _json.loads(msg["text"])
                        except _json.JSONDecodeError:
                            continue

                        kind = payload.get("type")
                        if kind == "set_context":
                            prefix = payload.get("prefix", "")
                            if isinstance(prefix, str):
                                session.context_prefix = prefix
                                log.info(
                                    "Voice context updated",
                                    extra={
                                        "session_id": session.session_id,
                                        "prefix_chars": len(prefix),
                                    },
                                )
                            continue
                        if kind == "text_input":
                            text = payload.get("text", "").strip()
                            if not text:
                                continue
                            await gemini_session.send_client_content(
                                turns={"role": "user", "parts": [{"text": text}]},
                                turn_complete=True,
                            )
                            await websocket.send_json({
                                "type": "transcript",
                                "source": "user",
                                "text": text,
                            })
                        elif kind == "end_session":
                            log.info(
                                "Browser requested end_session",
                                extra={"session_id": session.session_id},
                            )
                            session.is_active = False
                            return

            async with asyncio.TaskGroup() as tg:
                tg.create_task(audio_input_loop(), name="audio_input")
                tg.create_task(audio_output_loop(), name="audio_output")
                tg.create_task(gemini_response_loop(), name="gemini_response")
                tg.create_task(browser_message_loop(), name="browser_msg")
                # When any task returns / raises, the TaskGroup cancels siblings.

    except* WebSocketDisconnect:
        log.info(
            "Browser disconnect during session",
            extra={"session_id": session.session_id},
        )
    except* Exception as eg:
        for exc in eg.exceptions:
            log.error(
                "Voice session error",
                extra={"session_id": session.session_id, "error": repr(exc)},
            )
    finally:
        session.is_active = False
        if websocket.application_state.value == 1:  # CONNECTED
            try:
                await websocket.send_json({"type": "session_ended", "reason": "closed"})
            except Exception:
                pass
            try:
                await websocket.close()
            except Exception:
                pass
        log.info("Voice session closed", extra={"session_id": session.session_id})


async def _handle_tool_call(tool_call: Any, session: VoiceSession) -> None:
    """Dispatch each function_call in the tool_call message."""
    function_responses: list[FunctionResponse] = []
    for call in getattr(tool_call, "function_calls", []) or []:
        name = getattr(call, "name", "")
        args = getattr(call, "args", {}) or {}
        if name == "query_data":
            question = args.get("question", "")
            response_payload = await execute_query_data(
                question=question,
                conversation_id=session.conversation_id,
                ws=session.ws,
                session_id=session.session_id,
                context_prefix=session.context_prefix,
            )
        else:
            log.warning(
                "Unknown tool call from Gemini",
                extra={"session_id": session.session_id, "name": name},
            )
            response_payload = {"error": f"Unknown tool: {name}"}

        function_responses.append(
            FunctionResponse(
                id=getattr(call, "id", None),
                name=name,
                response=response_payload,
            )
        )

    if function_responses:
        await session.gemini_session.send_tool_response(
            LiveClientToolResponse(function_responses=function_responses)
        )
