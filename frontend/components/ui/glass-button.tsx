"use client";

import { motion } from "framer-motion";
import { type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

type Tone = "dark" | "light";

type GlassButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  type?: "button" | "submit";
  /**
   * Visual treatment.
   * - "dark" (default): white text on a low-alpha white tint — for dark backgrounds (landing aurora).
   * - "light": slate text on a denser white tint with softer shadow — for light backgrounds (canvas).
   */
  tone?: Tone;
};

const SIZE_CLASSES = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-base",
  lg: "h-14 px-10 text-lg",
} as const;

const TONE_STYLES: Record<
  Tone,
  {
    textClass: string;
    background: string;
    border: string;
    boxShadow: string;
    topHighlight: string;
    hoverShimmer: string;
  }
> = {
  dark: {
    textClass: "text-white",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)",
    border: "1px solid rgba(255,255,255,0.18)",
    boxShadow: [
      "0 8px 32px rgba(0,0,0,0.35)",
      "inset 0 1px 0 rgba(255,255,255,0.35)",
      "inset 0 -1px 0 rgba(0,0,0,0.25)",
      "inset 0 0 20px rgba(255,255,255,0.04)",
    ].join(", "),
    topHighlight:
      "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)",
    hoverShimmer:
      "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.18) 0%, transparent 60%)",
  },
  light: {
    textClass: "text-slate-900",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.55) 100%)",
    border: "1px solid rgba(255,255,255,0.7)",
    boxShadow: [
      "0 8px 24px rgba(15,23,42,0.08)",
      "inset 0 1px 0 rgba(255,255,255,0.9)",
      "inset 0 -1px 0 rgba(15,23,42,0.04)",
      "inset 0 0 20px rgba(255,255,255,0.4)",
    ].join(", "),
    topHighlight:
      "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.9) 50%, transparent 100%)",
    hoverShimmer:
      "radial-gradient(circle at 50% 0%, rgba(99,102,241,0.10) 0%, transparent 60%)",
  },
};

export function GlassButton({
  children,
  onClick,
  size = "md",
  className,
  type = "button",
  tone = "dark",
}: GlassButtonProps) {
  const reactId = useId().replace(/:/g, "");
  const distortionId = `glass-${reactId}`;
  const t = TONE_STYLES[tone];

  return (
    <>
      <svg
        aria-hidden="true"
        focusable="false"
        className="absolute h-0 w-0 overflow-hidden"
        style={{ position: "absolute", width: 0, height: 0 }}
      >
        <defs>
          <filter
            id={distortionId}
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            primitiveUnits="objectBoundingBox"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.6 0.6"
              numOctaves={2}
              seed={92}
              result="noise"
            />
            <feGaussianBlur in="noise" stdDeviation="0.02" result="blurredNoise" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="blurredNoise"
              scale="0.04"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <motion.button
        type={type}
        onClick={onClick}
        whileHover={{ scale: 1.08, y: -2 }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", stiffness: 520, damping: 20 }}
        className={cn(
          "group relative inline-flex items-center justify-center font-medium",
          "rounded-full overflow-hidden cursor-pointer select-none",
          "transition-shadow duration-300",
          t.textClass,
          SIZE_CLASSES[size],
          className,
        )}
        style={{
          background: t.background,
          backdropFilter: `url(#${distortionId}) blur(12px) saturate(180%)`,
          WebkitBackdropFilter: "blur(12px) saturate(180%)",
          border: t.border,
          boxShadow: t.boxShadow,
        }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-3 top-0 h-px rounded-full opacity-80"
          style={{ background: t.topHighlight }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{ background: t.hoverShimmer }}
        />
        <span className="relative z-10 whitespace-nowrap">{children}</span>
      </motion.button>
    </>
  );
}
