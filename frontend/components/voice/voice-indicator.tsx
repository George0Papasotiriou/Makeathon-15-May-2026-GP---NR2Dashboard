"use client";

import { motion } from "framer-motion";

type Props = {
  amplitude: number;
  active: boolean;
};

const BAR_COUNT = 5;

/**
 * Tiny vertical-bar amplitude meter for the voice button. Heights are
 * driven by `amplitude` (0..1) plus a small per-bar phase offset so the
 * stack feels alive even at low signal.
 */
export function VoiceIndicator({ amplitude, active }: Props) {
  const a = Math.max(0, Math.min(1, amplitude));
  return (
    <div className="flex h-4 items-center gap-[2px]" aria-hidden>
      {Array.from({ length: BAR_COUNT }).map((_, i) => {
        const phase = (i / BAR_COUNT) * Math.PI * 2;
        const wave = active ? 0.6 + 0.4 * Math.sin(phase + a * 6) : 0.2;
        const h = Math.max(0.15, a * wave + 0.15);
        return (
          <motion.span
            key={i}
            className="block w-[2px] rounded-full bg-current"
            animate={{ height: `${h * 100}%`, opacity: active ? 0.9 : 0.35 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}
