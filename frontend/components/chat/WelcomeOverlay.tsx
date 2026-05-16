"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const EXAMPLES = [
  "How is the bot doing this week?",
  "Compare bot v2.2.1 vs v2.3.0 containment rate by week",
  "Show top 10 intents by call volume",
  "CSAT by customer segment",
  "Show language consistency failures by region",
  "Find anomalies in tool latency for transfers",
  "Δείξε μου το CSAT ανά segment",
];

function RotatingExamples() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % EXAMPLES.length), 2800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="h-8 overflow-hidden text-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
          className="text-base text-muted-foreground"
        >
          Try{" "}
          <span className="text-foreground/85">&ldquo;{EXAMPLES[i]}&rdquo;</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

type Props = {
  show: boolean;
};

export function WelcomeOverlay({ show }: Props) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="welcome-overlay"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="dot-grid-bg absolute inset-0 z-30 flex flex-col items-center gap-5 bg-background pt-[14vh]"
        >
          <h1 className="text-6xl font-bold tracking-tight">Aperture</h1>
          <p className="text-sm text-muted-foreground">
            Natural-language analytics. Type a question, get a chart.
          </p>
          <div className="mt-2">
            <RotatingExamples />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
