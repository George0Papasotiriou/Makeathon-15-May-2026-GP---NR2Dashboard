"use client";

import {
  AlertTriangle,
  BarChart3,
  Code2,
  Gauge,
  PieChartIcon,
  Table as TableIcon,
  TrendingUp,
  X,
} from "lucide-react";
import { useState, type ReactElement } from "react";

import { ChartRenderer } from "@/components/canvas/ChartRenderer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SelectedItem, WidgetData } from "@/lib/api-types";

export type WidgetSize = "1x1" | "2x1" | "1x2" | "2x2";

export const WIDGET_PX: Record<WidgetSize, { width: number; height: number }> = {
  "1x1": { width: 260, height: 200 },
  "2x1": { width: 496, height: 240 },
  "1x2": { width: 260, height: 416 },
  "2x2": { width: 496, height: 416 },
};

export const DEFAULT_WIDGET_SIZE: WidgetSize = "2x1";

type Intent = {
  label: string;
  color: string;
  Icon: (props: { className?: string }) => ReactElement;
};

export function inferIntent(widget: WidgetData): Intent {
  const t = widget.spec.chartType;
  const text = `${widget.spec.title} ${widget.spec.description ?? ""} ${widget.explanation}`.toLowerCase();

  if (
    text.includes("anomaly") ||
    text.includes("spike") ||
    text.includes("incident") ||
    text.includes("drop") ||
    text.includes("failure")
  ) {
    return {
      label: "Anomaly",
      color: "var(--task-error)",
      Icon: (p) => <AlertTriangle {...p} />,
    };
  }
  if (
    t === "line" || t === "area" || t === "area-stacked" ||
    t === "combo" || t === "sparkline-kpi" || t === "radar" || t === "waterfall" ||
    text.includes("trend") || text.includes("over time") ||
    text.includes("daily") || text.includes("weekly") ||
    text.includes("by week") || text.includes("by day")
  ) {
    return {
      label: "Trend",
      color: "var(--task-thinking)",
      Icon: (p) => <TrendingUp {...p} />,
    };
  }
  if (
    t === "pie" || t === "treemap" ||
    t === "histogram" || t === "box-plot" || t === "heatmap" ||
    text.includes("distribution") || text.includes("share")
  ) {
    return {
      label: "Distribution",
      color: "var(--chart-4)",
      Icon: (p) => <PieChartIcon {...p} />,
    };
  }
  if (t === "kpi" || t === "gauge") {
    return {
      label: "KPI",
      color: "var(--task-executing)",
      Icon: (p) => <Gauge {...p} />,
    };
  }
  if (t === "table") {
    return {
      label: "Detail",
      color: "var(--muted-foreground)",
      Icon: (p) => <TableIcon {...p} />,
    };
  }
  if (
    t === "horizontal-bar" || t === "funnel" ||
    text.includes("top") || text.includes("highest") || text.includes("ranking") ||
    text.includes("by intent") || text.includes("by segment") || text.includes("by region")
  ) {
    return {
      label: "Ranking",
      color: "var(--task-sql)",
      Icon: (p) => <BarChart3 {...p} />,
    };
  }
  return {
    label: "Comparison",
    color: "var(--task-sql)",
    Icon: (p) => <BarChart3 {...p} />,
  };
}

type Props = {
  widget: WidgetData;
  onRemove?: (id: string) => void;
  streamedSql?: string;
  isSnapping?: boolean;
  selectedItems?: SelectedItem[];
  onSelectItem?: (item: SelectedItem) => void;
};

export function WidgetTile({
  widget,
  onRemove,
  streamedSql,
  isSnapping,
  selectedItems,
  onSelectItem,
}: Props) {
  const [showSql, setShowSql] = useState(false);
  const intent = inferIntent(widget);

  const widgetSelectedItems = selectedItems?.filter(
    (s) => s.widgetId === widget.id || s.widgetId.startsWith(`${widget.id}:`),
  );
  const hasAnySelection = (widgetSelectedItems?.length ?? 0) > 0;

  return (
    <div
      className={cn(
        "group widget-surface relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card p-3 shadow-sm hover:widget-active",
        hasAnySelection && "ring-2 ring-primary/70",
        isSnapping && "ring-2 ring-emerald-500 shadow-lg shadow-emerald-500/30",
      )}
    >
      <header className="mb-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-wide"
              style={{
                background: `color-mix(in oklab, ${intent.color} 18%, transparent)`,
                color: intent.color,
              }}
              title={`Detected intent: ${intent.label}`}
            >
              <intent.Icon className="h-2.5 w-2.5" />
              {intent.label}
            </span>
            <h3 className="truncate text-sm font-medium">{widget.spec.title}</h3>
          </div>
          {widget.spec.description && (
            <p className="truncate text-[11px] text-muted-foreground">
              {widget.spec.description}
            </p>
          )}
        </div>
        <div
          data-no-drag
          className={cn(
            "flex shrink-0 items-center gap-0.5 transition-opacity",
            hasAnySelection
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100",
          )}
        >
          {widget.sql && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setShowSql((v) => !v)}
              title="Show SQL"
            >
              <Code2 className="h-3 w-3" />
            </Button>
          )}
          {onRemove && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => onRemove(widget.id)}
              title="Remove widget"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </header>

      <div
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
        data-no-drag=""
      >
        {showSql ? (
          <div data-scrollable className="h-full w-full overflow-auto">
            <pre className="whitespace-pre-wrap break-all font-mono text-[10px] leading-snug text-muted-foreground">
              {widget.sql}
            </pre>
          </div>
        ) : streamedSql !== undefined &&
          streamedSql.length < widget.sql.length ? (
          <div className="h-full w-full overflow-hidden">
            <pre className="max-h-full whitespace-pre-wrap break-all font-mono text-[10px] leading-snug text-muted-foreground">
              {streamedSql}
              <span className="ml-0.5 inline-block h-2.5 w-[2px] animate-pulse bg-foreground/70 align-middle" />
            </pre>
          </div>
        ) : (
          <ChartRenderer
            widget={widget}
            selectedItems={widgetSelectedItems}
            onSelectItem={onSelectItem}
          />
        )}
      </div>

      {widget.explanation && (
        <footer className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {widget.explanation}
        </footer>
      )}
    </div>
  );
}
