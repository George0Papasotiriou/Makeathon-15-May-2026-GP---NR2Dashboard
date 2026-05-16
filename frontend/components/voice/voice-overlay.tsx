"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type {
  TranscriptTurn,
  VoicePhase,
} from "@/hooks/voice/use-voice-session";

type Props = {
  phase: VoicePhase;
  transcript: TranscriptTurn[];
  amplitude: number;
  isAgentSpeaking: boolean;
};

const MAX_VISIBLE_TURNS = 6;

function statusLabel(
  phase: VoicePhase,
  isAgentSpeaking: boolean,
  amplitude: number,
): string {
  if (phase === "connecting") return "Connecting…";
  if (phase === "closing") return "Ending session…";
  if (isAgentSpeaking) return "Agent speaking";
  if (amplitude > 0.04) return "Listening";
  return "Speak";
}

/**
 * Voice transcript overlay. Anchored above the chat input; visible
 * throughout connecting → active → closing so the user always sees what
 * the session is doing. Skinned with the same `bg-background/85` glass
 * tokens used by the chat panel so it reads as part of the app.
 */
export function VoiceOverlay({
  phase,
  transcript,
  amplitude,
  isAgentSpeaking,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const visible = phase !== "idle";

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [transcript.length]);

  const visibleTurns = transcript.slice(-MAX_VISIBLE_TURNS);
  const status = statusLabel(phase, isAgentSpeaking, amplitude);
  const isConnecting = phase === "connecting";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="voice-overlay"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none fixed inset-x-0 bottom-32 z-40 flex justify-center px-4 md:bottom-36"
        >
          <div className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-border/70 bg-background/85 p-4 shadow-xl backdrop-blur">
            {/* Status row */}
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    isConnecting
                      ? "bg-amber-500"
                      : isAgentSpeaking
                        ? "bg-indigo-500"
                        : "bg-emerald-500"
                  }`}
                >
                  {!isConnecting && (
                    <motion.span
                      aria-hidden
                      className={`absolute inset-0 rounded-full ${
                        isAgentSpeaking ? "bg-indigo-500" : "bg-emerald-500"
                      }`}
                      animate={{ opacity: [0.6, 0, 0.6], scale: [1, 2.2, 1] }}
                      transition={{
                        duration: 1.6,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  )}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {status}
                </span>
              </div>
              {isConnecting && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Transcript scroller */}
            <div
              ref={scrollerRef}
              className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1"
            >
              {visibleTurns.length === 0 && (
                <div className="py-2 text-center text-xs text-muted-foreground/70">
                  {isConnecting
                    ? "Opening voice channel"
                    : "Your conversation will appear here"}
                </div>
              )}
              {visibleTurns.map((turn, i) => {
                const isLatest = i === visibleTurns.length - 1;
                const isAgent = turn.source === "agent";
                return (
                  <motion.div
                    key={turn.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: isLatest ? 1 : 0.7, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex ${
                      isAgent ? "justify-start" : "justify-end"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                        isAgent
                          ? "bg-muted text-foreground"
                          : "bg-primary/10 text-foreground"
                      } ${
                        isLatest
                          ? "border border-primary/30"
                          : "border border-border/60"
                      }`}
                    >
                      {turn.text}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Amplitude bar */}
            <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-primary"
                animate={{ width: `${Math.min(100, amplitude * 140)}%` }}
                transition={{ duration: 0.12, ease: "easeOut" }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
