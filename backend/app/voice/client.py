"""Gemini Live client + LiveConnectConfig builder.

AI Studio direct (not Vertex AI). One config covers: voice system prompt,
audio modality, voice/VAD, single tool (query_data), transcription
streams for both directions.
"""

from __future__ import annotations

from google import genai
from google.genai.types import (
    AutomaticActivityDetection,
    AudioTranscriptionConfig,
    EndSensitivity,
    LiveConnectConfig,
    Modality,
    PrebuiltVoiceConfig,
    RealtimeInputConfig,
    SpeechConfig,
    StartSensitivity,
    Tool,
    VoiceConfig,
)

from app.logger import get_logger
from app.settings import settings
from app.voice.prompts import build_voice_system_prompt
from app.voice.tools import QUERY_DATA_TOOL

log = get_logger("voice.client")

_client: genai.Client | None = None


def create_gemini_client() -> genai.Client:
    """Lazy singleton. AI Studio direct, not Vertex."""
    global _client
    if _client is None:
        if not settings.GOOGLE_API_KEY:
            raise RuntimeError("GOOGLE_API_KEY is not set. Set it in backend/.env.")
        _client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        log.info(
            "Gemini client initialized",
            extra={"voice_model": settings.VOICE_MODEL},
        )
    return _client


def build_live_connect_config() -> LiveConnectConfig:
    """Single source of truth for voice session config."""
    voice_config = VoiceConfig(
        prebuilt_voice_config=PrebuiltVoiceConfig(voice_name=settings.VOICE_NAME),
    )

    speech = SpeechConfig(voice_config=voice_config)

    vad = AutomaticActivityDetection(
        disabled=False,
        # HIGH start = triggers on quieter speech onsets; LOW end = does
        # not cut user off mid-sentence on brief pauses.
        start_of_speech_sensitivity=StartSensitivity.START_SENSITIVITY_HIGH,
        end_of_speech_sensitivity=EndSensitivity.END_SENSITIVITY_LOW,
        # Preserve more pre-roll so the first phoneme isn't clipped.
        prefix_padding_ms=300,
        # Tighter end-of-turn so the agent replies quickly after the
        # speaker stops (1.5s felt laggy).
        silence_duration_ms=800,
    )

    realtime_input_config = RealtimeInputConfig(automatic_activity_detection=vad)

    return LiveConnectConfig(
        response_modalities=[Modality.AUDIO],
        speech_config=speech,
        system_instruction=build_voice_system_prompt(),
        tools=[Tool(function_declarations=[QUERY_DATA_TOOL])],
        input_audio_transcription=AudioTranscriptionConfig(),
        output_audio_transcription=AudioTranscriptionConfig(),
        realtime_input_config=realtime_input_config,
    )
