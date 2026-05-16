"use client";

import { AnimatePresence, motion } from "framer-motion";

const SUGGESTIONS: ReadonlyArray<{ label: string; query: string }> = [
  { label: "Containment by intent", query: "What is the containment rate by intent?" },
  { label: "Daily call volume", query: "Show me the daily call volume" },
  { label: "Top intents", query: "What are the top 5 intents by volume?" },
  { label: "v2.3.0 vs v2.2.1", query: "Compare bot v2.3.0 to v2.2.1 on key metrics" },
  { label: "Average CSAT", query: "What is the average CSAT score?" },
];

type Props = {
  onSelect: (query: string) => void;
  visible: boolean;
};

export function SuggestionPills({ onSelect, visible }: Props) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
          transition={{ duration: 0.4, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none fixed bottom-36 left-1/2 z-30 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 md:bottom-40"
        >
          <div className="pointer-events-auto flex flex-wrap gap-2">
            {SUGGESTIONS.map((s, i) => (
              <motion.button
                key={s.label}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.3,
                  delay: 0.7 + i * 0.05,
                  ease: [0.22, 1, 0.36, 1],
                }}
                whileHover={{ y: -2, scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onSelect(s.query)}
                className="rounded-full px-4 py-2 text-xs text-foreground transition-colors"
                style={{
                  background: `linear-gradient(135deg,
                    rgba(var(--glass-bg), 0.7) 0%,
                    rgba(var(--glass-bg), 0.5) 100%)`,
                  backdropFilter: "blur(20px) saturate(180%)",
                  WebkitBackdropFilter: "blur(20px) saturate(180%)",
                  border: "1px solid rgba(var(--glass-border), 0.4)",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.04)",
                }}
              >
                {s.label}
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
