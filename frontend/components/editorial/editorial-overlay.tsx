"use client";

import { motion } from "framer-motion";
import { Download, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChartCardData, EditorialResponse } from "@/lib/api-types";
import { createLogger } from "@/lib/logger";
import { generateEditorialPDF } from "@/lib/pdf-export";
import { EditorialDocument } from "./editorial-document";

const log = createLogger("editorial-overlay");

interface EditorialOverlayProps {
  editorial: EditorialResponse | null;
  charts: ChartCardData[];
  onClose: () => void;
  loading?: boolean;
}

export function EditorialOverlay({
  editorial,
  charts,
  onClose,
  loading = false,
}: EditorialOverlayProps) {
  const docRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleDownload = async () => {
    if (!docRef.current || !editorial) return;
    setExporting(true);
    try {
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const filename = `aperture-editorial-${editorial.metadata.conversation_id.slice(0, 8)}-${stamp}.pdf`;
      await generateEditorialPDF(docRef.current, filename);
    } catch (err) {
      log.error("PDF export failed", { error: String(err) });
    } finally {
      setExporting(false);
    }
  };

  const showDoc = !loading && editorial !== null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md"
      onClick={onClose}
    >
      {/* Scrollable content area */}
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto py-12">
        {!showDoc ? (
          /* Loading state — centered glass card, no floating buttons */
          <div
            className="flex min-h-[calc(100vh-6rem)] w-full items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex flex-col items-center gap-4 rounded-2xl px-10 py-8"
              style={{
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%)",
                backdropFilter: "blur(24px) saturate(180%)",
                WebkitBackdropFilter: "blur(24px) saturate(180%)",
                border: "1px solid rgba(255,255,255,0.15)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.24)",
              }}
            >
              <Loader2 className="h-6 w-6 animate-spin text-white/70" />
              <p className="animate-pulse text-xs text-white/60">
                Crafting the briefing…
              </p>
            </div>
          </div>
        ) : (
          /* Document — stop propagation so clicking doc doesn't close overlay.
             zoom: 0.7 shrinks layout AND visual box for preview; PDF capture
             neutralizes this via explicit width/height in pdf-export.ts. */
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 794,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              zoom: 0.7 as any,
            }}
          >
            <EditorialDocument
              ref={docRef}
              editorial={editorial}
              charts={charts}
            />
          </motion.div>
        )}
      </div>

      {/* Floating glass action cluster — fixed so they stay during scroll.
          Only rendered after editorial data arrives. */}
      {showDoc && (
        <div className="fixed top-6 right-6 z-[101] flex gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleDownload();
            }}
            disabled={exporting}
            aria-label="Download PDF"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/90 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl transition-all duration-200 hover:border-white/30 hover:bg-white/20 disabled:opacity-40"
          >
            {exporting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Download size={18} />
            )}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close preview"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/90 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl transition-all duration-200 hover:border-white/30 hover:bg-white/20"
          >
            <X size={18} />
          </button>
        </div>
      )}
    </motion.div>
  );
}
