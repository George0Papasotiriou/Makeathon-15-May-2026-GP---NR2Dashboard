"use client";

import { motion } from "framer-motion";
import { Mic, MicOff } from "lucide-react";
import { VoiceIndicator } from "./voice-indicator";

type Props = {
  active: boolean;
  amplitude: number;
  disabled?: boolean;
  onToggle: () => void;
};

/**
 * Mic toggle. Inactive → standard outline mic. Active → glowing pulse
 * ring with amplitude meter inside (drives off the same amplitude that
 * the overlay uses).
 */
export function VoiceButton({ active, amplitude, disabled, onToggle }: Props) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={active ? "End voice mode" : "Start voice mode"}
      whileHover={disabled ? undefined : { scale: 1.08 }}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      transition={{ type: "spring", stiffness: 500, damping: 22 }}
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
    >
      {active && (
        <>
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              boxShadow:
                "0 0 0 1px rgba(99,102,241,0.55), 0 0 14px rgba(99,102,241,0.45)",
            }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.span
            aria-hidden
            className="absolute inset-[-4px] rounded-full"
            style={{ border: "1px solid rgba(99,102,241,0.35)" }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.0, 0.3] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        </>
      )}
      <span className="relative z-10 flex items-center justify-center text-foreground">
        {active ? (
          <span className="flex h-4 w-4 items-center justify-center text-indigo-500">
            <VoiceIndicator amplitude={amplitude} active />
          </span>
        ) : disabled ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </span>
    </motion.button>
  );
}
