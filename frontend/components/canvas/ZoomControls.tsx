"use client";

import { Maximize2, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
};

export function ZoomControls({ zoom, onZoomIn, onZoomOut, onReset }: Props) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/60 bg-background/70 p-0.5">
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={onZoomOut}
        title="Zoom out"
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <button
        type="button"
        onClick={onReset}
        title="Reset zoom to 100%"
        className="min-w-[44px] rounded px-1.5 text-xs tabular-nums text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        {Math.round(zoom * 100)}%
      </button>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={onZoomIn}
        title="Zoom in"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
