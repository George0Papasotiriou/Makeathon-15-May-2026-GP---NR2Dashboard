"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredAuthKey } from "@/lib/auth";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { useAudioCapture } from "./use-audio-capture";
import { useAudioPlayback } from "./use-audio-playback";
import { type ChartReadyMessage, voiceMessageSchema } from "./voice-messages";

const log = createLogger("voice.session");

export type TranscriptTurn = {
  id: string;
  source: "user" | "agent";
  text: string;
  timestamp: number;
};

export type VoiceChartReady = {
  chart_id: string;
  chart_spec: unknown;
  data: Array<Record<string, unknown>>;
  panel_data?: Array<Array<Record<string, unknown>>> | null;
  explanation: string;
};

type StartOptions = {
  conversationId: string;
  onChartReady: (payload: VoiceChartReady) => void;
  onEnd?: (reason: string) => void;
  /** Canvas-selection context block; prepended to every Claude question
   *  during this session. Empty string disables. */
  contextPrefix?: string;
};

export type VoicePhase = "idle" | "connecting" | "active" | "closing";

export class VoiceMicPermissionError extends Error {
  constructor(cause?: unknown) {
    super("Microphone access denied");
    this.name = "VoiceMicPermissionError";
    if (cause) (this as { cause?: unknown }).cause = cause;
  }
}

type VoiceSessionHandle = {
  phase: VoicePhase;
  isActive: boolean;
  isAgentSpeaking: boolean;
  transcript: TranscriptTurn[];
  amplitude: number;
  start: (opts: StartOptions) => Promise<void>;
  stop: (reason?: string) => Promise<void>;
  sendTextInput: (text: string) => void;
};

function deriveVoiceWsUrl(): string {
  const explicit = env.NEXT_PUBLIC_VOICE_WS_URL;
  if (explicit) return explicit;
  const backend = env.NEXT_PUBLIC_BACKEND_URL;
  const wsProto = backend.startsWith("https://") ? "wss://" : "ws://";
  const stripped = backend.replace(/^https?:\/\//, "");
  return `${wsProto}${stripped}/ws/voice`;
}

function isMicPermissionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // getUserMedia rejects with DOMException; name is "NotAllowedError"
  // when the user denies, or "NotFoundError" when no device.
  return (
    err.name === "NotAllowedError" ||
    err.name === "NotFoundError" ||
    err.name === "SecurityError" ||
    /permission/i.test(err.message)
  );
}

// Amplitude-floor fallback for auto-close (the primary signal is the
// `turn_complete` message from the server). Used only if the model never
// emits turn_complete after a tool call.
const POST_RESPONSE_SILENCE_MS = 800;
// Hard ceiling — end no matter what this long after a chart_ready.
const POST_RESPONSE_MAX_MS = 6000;
// playAmp must stay below this for SILENCE_MS to count as silence. The
// analyser noise floor sits around 0.005-0.01, so 0.02 is a safe gate.
const POST_RESPONSE_SILENCE_AMP = 0.02;

export function useVoiceSession(): VoiceSessionHandle {
  const wsRef = useRef<WebSocket | null>(null);
  const optsRef = useRef<StartOptions | null>(null);
  const transcriptBufRef = useRef<Map<string, TranscriptTurn>>(new Map());
  const ampRafRef = useRef<number | null>(null);
  // Single-flight phase guard. Only `idle` allows start(); only `active`
  // allows stop(). Other clicks during transitions are rejected silently.
  const phaseRef = useRef<VoicePhase>("idle");
  // Auto-close bookkeeping after a chart_ready arrives.
  const pendingAutoCloseRef = useRef(false);
  const agentSilenceStartRef = useRef<number | null>(null);
  const autoCloseStartRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [amplitude, setAmplitude] = useState(0);

  const capture = useAudioCapture();
  const playback = useAudioPlayback();

  const setPhaseBoth = useCallback((next: VoicePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const appendTranscript = useCallback(
    (source: "user" | "agent", text: string) => {
      if (!text) return;
      const key = `${source}-current`;
      const buf = transcriptBufRef.current;
      const existing = buf.get(key);
      if (existing && Date.now() - existing.timestamp < 4000) {
        existing.text += text;
        existing.timestamp = Date.now();
      } else {
        const fresh: TranscriptTurn = {
          id: crypto.randomUUID(),
          source,
          text,
          timestamp: Date.now(),
        };
        buf.set(key, fresh);
      }
      setTranscript(
        Array.from(buf.values()).sort((a, b) => a.timestamp - b.timestamp),
      );
    },
    [],
  );

  const finalizeAgentTurn = useCallback(() => {
    transcriptBufRef.current.delete("agent-current");
    setIsAgentSpeaking(false);
  }, []);

  /**
   * Tear-down order matters: kill PLAYBACK first (close ctx → silences
   * scheduled audio immediately), then capture (releases mic), then WS.
   * Reversing this would let the last 100-300ms of agent speech trail
   * after the overlay closes.
   */
  const stop = useCallback(
    async (reason: string = "user_toggle") => {
      // Reject if not in a stable-to-stop state.
      if (phaseRef.current === "idle" || phaseRef.current === "closing") {
        return;
      }
      setPhaseBoth("closing");
      log.info("Stopping voice session", { reason });

      pendingAutoCloseRef.current = false;
      agentSilenceStartRef.current = null;
      autoCloseStartRef.current = null;

      if (ampRafRef.current !== null) {
        cancelAnimationFrame(ampRafRef.current);
        ampRafRef.current = null;
      }

      // 1. Kill audio playback FIRST. ctx.close() cancels all scheduled
      //    AudioBufferSource nodes immediately.
      playback.stopAudio();
      try {
        await playback.destroy();
      } catch (err) {
        log.warn("playback.destroy failed", { error: String(err) });
      }

      // 2. Release mic + capture audio graph.
      try {
        await capture.stop();
      } catch (err) {
        log.warn("capture.stop failed", { error: String(err) });
      }

      // 3. Close WS last — server-side handler will tear down Gemini session.
      const ws = wsRef.current;
      if (ws) {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "end_session" }));
          }
          ws.close();
        } catch {
          // ignore — already closed or never opened
        }
      }
      wsRef.current = null;

      setIsAgentSpeaking(false);
      setAmplitude(0);
      setPhaseBoth("idle");

      const onEnd = optsRef.current?.onEnd;
      optsRef.current = null;
      onEnd?.(reason);
    },
    [capture, playback, setPhaseBoth],
  );

  const start = useCallback(
    async (opts: StartOptions) => {
      // Single-flight: only allowed from idle.
      if (phaseRef.current !== "idle") {
        log.debug("start() ignored — phase not idle", {
          phase: phaseRef.current,
        });
        return;
      }
      setPhaseBoth("connecting");
      optsRef.current = opts;
      transcriptBufRef.current.clear();
      setTranscript([]);

      // 1. Request mic permission + init audio graphs FIRST.
      //    If user denies, throw before any WS opens. Caller catches and
      //    shows the inline toast.
      try {
        await playback.init();
        await capture.init((chunk) => {
          const ws = wsRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) ws.send(chunk);
        });
      } catch (err) {
        log.error("Audio init failed", {
          error: String(err),
          name: (err as Error)?.name,
        });
        // Tear down whatever opened.
        try {
          await capture.stop();
        } catch {
          // ignore
        }
        try {
          await playback.destroy();
        } catch {
          // ignore
        }
        optsRef.current = null;
        setPhaseBoth("idle");
        if (isMicPermissionError(err)) {
          throw new VoiceMicPermissionError(err);
        }
        throw err;
      }

      // 2. Open WS. Mic is hot but onChunk drops messages until ws is open.
      const authKey = getStoredAuthKey();
      const params = new URLSearchParams({ conversation_id: opts.conversationId });
      if (authKey) params.set("auth_key", authKey);
      const url = `${deriveVoiceWsUrl()}?${params.toString()}`;
      log.info("Opening voice WS", { url });
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = async () => {
        log.info("Voice WS open");
        // Push the canvas-selection context FIRST, before resuming the
        // mic. Resuming the AudioContext flushes any queued mic chunks
        // through ws.send(), which would race ahead of the context
        // message and leave the server processing the first tool call
        // without it.
        if (opts.contextPrefix) {
          try {
            ws.send(
              JSON.stringify({
                type: "set_context",
                prefix: opts.contextPrefix,
              }),
            );
          } catch (err) {
            log.warn("set_context send failed", { error: String(err) });
          }
        }
        try {
          await capture.resume();
        } catch (err) {
          log.warn("capture.resume failed", { error: String(err) });
        }
        setPhaseBoth("active");

        const tick = () => {
          const playAmp = playback.getAmplitude();
          const capAmp = capture.getAmplitude();
          const blend = Math.max(playAmp * 3, capAmp * 1.5);
          setAmplitude(Math.min(1, blend));
          setIsAgentSpeaking(playAmp > 0.01);

          // Auto-close after agent finishes its post-tool reply.
          if (pendingAutoCloseRef.current) {
            const now = performance.now();
            if (autoCloseStartRef.current === null) {
              autoCloseStartRef.current = now;
            }
            const hitCeiling =
              now - (autoCloseStartRef.current ?? now) > POST_RESPONSE_MAX_MS;
            if (playAmp < POST_RESPONSE_SILENCE_AMP) {
              if (agentSilenceStartRef.current === null) {
                agentSilenceStartRef.current = now;
              } else if (
                now - agentSilenceStartRef.current >
                POST_RESPONSE_SILENCE_MS
              ) {
                pendingAutoCloseRef.current = false;
                agentSilenceStartRef.current = null;
                autoCloseStartRef.current = null;
                void stop("auto_close_after_response");
                return;
              }
            } else {
              agentSilenceStartRef.current = null;
            }
            if (hitCeiling) {
              pendingAutoCloseRef.current = false;
              agentSilenceStartRef.current = null;
              autoCloseStartRef.current = null;
              void stop("auto_close_timeout");
              return;
            }
          }
          ampRafRef.current = requestAnimationFrame(tick);
        };
        ampRafRef.current = requestAnimationFrame(tick);
      };

      ws.onmessage = (ev) => {
        if (ev.data instanceof ArrayBuffer) {
          // Drop audio if we're already closing — prevents tail playback.
          if (phaseRef.current !== "active") return;
          playback.enqueueAudio(ev.data);
          return;
        }
        // Text frame — validate against Zod schema, never trust the wire.
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(ev.data as string);
        } catch (e) {
          log.warn("Voice WS: malformed JSON frame", { error: String(e) });
          return;
        }
        const result = voiceMessageSchema.safeParse(parsedJson);
        if (!result.success) {
          log.warn("Voice WS: unknown message shape", {
            error: result.error.issues[0]?.message,
          });
          return;
        }
        const msg = result.data;
        switch (msg.type) {
          case "session_started":
            log.info("session_started", {
              session_id: msg.session_id,
              conversation_id: msg.conversation_id,
            });
            break;
          case "transcript":
            appendTranscript(msg.source, msg.text);
            if (msg.source === "agent") setIsAgentSpeaking(true);
            break;
          case "chart_ready":
            log.info("chart_ready", { chart_id: msg.chart_id });
            opts.onChartReady(msg as ChartReadyMessage);
            // Arm auto-close: once the agent's verbal confirmation goes
            // silent for POST_RESPONSE_SILENCE_MS we tear down the session.
            pendingAutoCloseRef.current = true;
            agentSilenceStartRef.current = null;
            autoCloseStartRef.current = null;
            break;
          case "interrupted":
            log.info("interrupted");
            playback.stopAudio();
            finalizeAgentTurn();
            break;
          case "turn_complete":
            log.info("turn_complete");
            // If a chart was just pushed, end the session as soon as the
            // already-buffered audio finishes — short, deterministic
            // close instead of the amplitude-floor fallback.
            if (pendingAutoCloseRef.current) {
              pendingAutoCloseRef.current = false;
              agentSilenceStartRef.current = null;
              autoCloseStartRef.current = null;
              setTimeout(() => {
                if (phaseRef.current === "active") {
                  void stop("turn_complete");
                }
              }, 400);
            }
            break;
          case "session_ended":
            log.info("session_ended", { reason: msg.reason });
            void stop(msg.reason ?? "server_closed");
            break;
          case "session_error":
            log.error("session_error", { message: msg.message });
            void stop("error");
            break;
        }
      };

      ws.onerror = (e) => {
        log.error("Voice WS error", { e: String(e) });
      };

      ws.onclose = () => {
        log.info("Voice WS closed");
        if (
          phaseRef.current === "connecting" ||
          phaseRef.current === "active"
        ) {
          void stop("ws_closed");
        }
      };
    },
    [
      capture,
      playback,
      appendTranscript,
      finalizeAgentTurn,
      stop,
      setPhaseBoth,
    ],
  );

  const sendTextInput = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "text_input", text }));
  }, []);

  // Unmount safety — if the canvas is destroyed (route nav, hot-reload)
  // while voice is connecting/active, release the mic and close the WS.
  // capture/playback hooks ALSO have their own unmount teardown, but the
  // WS only this hook owns.
  useEffect(() => {
    return () => {
      const ws = wsRef.current;
      if (ws) {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "end_session" }));
          }
          ws.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
      if (ampRafRef.current !== null) {
        cancelAnimationFrame(ampRafRef.current);
        ampRafRef.current = null;
      }
      phaseRef.current = "idle";
    };
  }, []);

  return {
    phase,
    isActive: phase === "active",
    isAgentSpeaking,
    transcript,
    amplitude,
    start,
    stop,
    sendTextInput,
  };
}
