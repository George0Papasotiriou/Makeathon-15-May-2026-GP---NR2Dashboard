"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Fragment, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VoiceButton } from "@/components/voice/voice-button";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  { label: "Version comparison", query: "Compare bot v2.2.1 vs v2.3.0 containment rate by week" },
  { label: "Incident window", query: "Show tool success rate and latency over time by intent category" },
  { label: "Segment quality", query: "CSAT and containment rate by customer segment" },
  { label: "Seasonality", query: "Show call volume by hour of day and day of week" },
  { label: "LLM quality", query: "Show LLM-judge disagreement rate: intent_resolved vs call_successful" },
  { label: "Call cascade", query: "Show resolution rate for repeat callers after an auth escalation" },
  { label: "Transfer risk", query: "Escalation rate by transfer amount bucket" },
  { label: "Language issues", query: "Show language consistency failures by region" },
];

export type ChatPhase =
  | "idle"
  | "thinking"
  | "sql"
  | "executing"
  | "done"
  | "error";

const PHASE_VAR: Record<Exclude<ChatPhase, "idle">, string> = {
  thinking: "var(--task-thinking)",
  sql: "var(--task-sql)",
  executing: "var(--task-executing)",
  done: "var(--task-done)",
  error: "var(--task-error)",
};

function renderInlineMarkdown(text: string): ReactNode[] {
  const tokenRe = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  const pushText = (s: string) => {
    if (!s) return;
    const parts = s.split("\n");
    parts.forEach((p, i) => {
      if (p) out.push(<Fragment key={key++}>{p}</Fragment>);
      if (i < parts.length - 1) out.push(<br key={key++} />);
    });
  };
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(text)) !== null) {
    pushText(text.slice(last, m.index));
    if (m[2] !== undefined) {
      out.push(<strong key={key++}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      out.push(<em key={key++}>{m[3]}</em>);
    } else if (m[4] !== undefined) {
      out.push(
        <code key={key++} className="rounded bg-black/10 px-1 py-0.5 text-[0.9em] dark:bg-white/10">
          {m[4]}
        </code>,
      );
    }
    last = m.index + m[0].length;
  }
  pushText(text.slice(last));
  return out;
}

const PHASE_LABEL: Record<Exclude<ChatPhase, "idle">, string> = {
  thinking: "Thinking",
  sql: "Processing",
  executing: "Processing",
  done: "Finishing up",
  error: "Failed",
};

type Props = {
  onSubmit: (question: string) => void;
  disabled?: boolean;
  showSuggestions?: boolean;
  phase?: ChatPhase;
  followUpHint?: string;
  clarification?: string;
  hasSelection?: boolean;
  voiceActive?: boolean;
  voiceAmplitude?: number;
  voiceDisabled?: boolean;
  onToggleVoice?: () => void;
};

export function ChatInput({
  onSubmit,
  disabled,
  showSuggestions = true,
  phase = "idle",
  followUpHint,
  clarification,
  hasSelection = false,
  voiceActive = false,
  voiceAmplitude = 0,
  voiceDisabled = false,
  onToggleVoice,
}: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  };

  const isProcessing = !!disabled || (phase !== "idle" && phase !== "done");
  const activePhase: Exclude<ChatPhase, "idle"> =
    phase !== "idle" ? phase : "thinking";
  const racingColor = PHASE_VAR[activePhase];
  const phaseLabel = PHASE_LABEL[activePhase];

  const buttonStyle: CSSProperties | undefined = isProcessing
    ? ({ ["--racing-color" as never]: racingColor } as CSSProperties)
    : undefined;

  return (
    <div className="flex flex-col gap-3">
      {clarification && !isProcessing && (
        <button
          type="button"
          onClick={() => {
            setValue(clarification);
            inputRef.current?.focus();
          }}
          className="self-start rounded-lg border border-lime-500/30 bg-lime-300/10 px-3 py-1.5 text-left text-xs text-gray-800 transition hover:bg-lime-500/10 dark:text-gray-100"
          title="Click to prefill"
        >
          <span className="mr-1 font-semibold">Clarify:</span>
          {renderInlineMarkdown(clarification)}
        </button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
        className="relative"
      >
        <Input
          ref={inputRef}
          value={isProcessing ? "" : value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={isProcessing ? "" : "Ask your data anything…  (⌘K)"}
          disabled={isProcessing}
          className={cn("h-12 text-base", onToggleVoice ? "pr-24" : "pr-14")}
          autoComplete="off"
          spellCheck={false}
        />
        {isProcessing && (
          <div className="pointer-events-none absolute inset-y-0 left-0 right-14 flex items-center px-4">
            <AnimatePresence mode="wait">
              <motion.span
                key={activePhase}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                className="flex items-baseline gap-1 text-base font-medium"
                style={{ color: racingColor }}
              >
                <span>{phaseLabel}</span>
                <span aria-hidden className="inline-flex">
                  <span className="typing-dot">.</span>
                  <span className="typing-dot">.</span>
                  <span className="typing-dot">.</span>
                </span>
              </motion.span>
            </AnimatePresence>
          </div>
        )}
        <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
          {onToggleVoice && (
            <VoiceButton
              active={voiceActive}
              amplitude={voiceAmplitude}
              disabled={voiceDisabled}
              onToggle={onToggleVoice}
            />
          )}
          <Button
            type="submit"
            size="icon"
            disabled={isProcessing || !value.trim()}
            className={cn("relative h-9 w-9", isProcessing && "racing-border")}
            style={buttonStyle}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </form>

      {followUpHint && !hasSelection ? (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => submit(followUpHint)}
            disabled={isProcessing}
            className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/15 disabled:opacity-50"
            title="Suggested follow-up"
          >
            <span className="mr-1 opacity-60">Try:</span>
            {followUpHint}
          </button>
        </div>
      ) : (
        showSuggestions && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => submit(s.query)}
                disabled={isProcessing}
                className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                {s.label}
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}
