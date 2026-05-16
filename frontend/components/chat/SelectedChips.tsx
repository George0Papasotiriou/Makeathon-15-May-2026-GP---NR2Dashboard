"use client";

import { AnimatePresence, motion } from "framer-motion";
import { MousePointerClick, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SelectedItem } from "@/lib/api-types";

type Props = {
  items: SelectedItem[];
  onRemove: (uid: string) => void;
  onClear: () => void;
};

const KIND_BADGE: Record<SelectedItem["kind"], string> = {
  row: "row",
  bar: "bar",
  slice: "slice",
  kpi: "KPI",
  widget: "card",
  point: "point",
  cell: "cell",
  stage: "stage",
  tile: "tile",
};

function formatLabel(label: string): { field: string | null; value: string } {
  const eq = label.indexOf("=");
  if (eq <= 0) return { field: null, value: label };
  return { field: label.slice(0, eq), value: label.slice(eq + 1) };
}

export function SelectedChips({ items, onRemove, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;
  const effectiveOpen = open && items.length > 0;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-semibold tabular-nums text-primary transition hover:bg-primary/15",
          effectiveOpen && "ring-1 ring-primary/40",
        )}
        aria-expanded={effectiveOpen}
        aria-haspopup="true"
      >
        <MousePointerClick className="h-3 w-3" />
        Context · {items.length}
      </button>
      <AnimatePresence>
        {effectiveOpen && (
          <motion.div
            key="ctx-popover"
            role="dialog"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{
              type: "spring",
              stiffness: 420,
              damping: 32,
              mass: 0.6,
            }}
            style={{ transformOrigin: "bottom left" }}
            className="absolute bottom-full left-0 z-50 mb-2 w-[28rem] max-w-[92vw] rounded-lg border border-border/70 bg-popover p-2 text-popover-foreground shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold text-muted-foreground">
                {items.length} item{items.length === 1 ? "" : "s"} in context
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
              >
                Deselect all
              </Button>
            </div>
            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-0.5">
              {items.map((it) => {
                const { field, value } = formatLabel(it.label);
                return (
                  <motion.div
                    key={it.uid}
                    layout
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    transition={{ duration: 0.14 }}
                    className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5"
                    title={
                      it.widgetTitle ? `${it.widgetTitle} → ${it.label}` : it.label
                    }
                  >
                    <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] capitalize font-medium text-primary/90">
                      {KIND_BADGE[it.kind]}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate text-xs font-medium text-foreground">
                        {value}
                      </span>
                      <span className="truncate text-[10px] text-muted-foreground">
                        {field ? `${field} · ` : ""}
                        {it.widgetTitle ?? ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(it.uid)}
                      className="shrink-0 rounded p-0.5 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                      aria-label="Remove from context"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
