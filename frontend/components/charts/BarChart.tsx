"use client";

import { useEffect, useRef } from "react";
import {
  Bar,
  CartesianGrid,
  BarChart as RechartsBarChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ChartSpec, SelectedItem } from "@/lib/api-types";
import { formatValue } from "@/lib/format";

type Props = {
  spec: ChartSpec;
  data: Array<Record<string, unknown>>;
  widgetId: string;
  widgetTitle: string;
  selectedItems?: SelectedItem[];
  onSelectItem?: (item: SelectedItem) => void;
  stacked?: boolean;
};

export function BarChart({
  spec,
  data,
  widgetId,
  widgetTitle,
  selectedItems,
  onSelectItem,
  stacked,
}: Props) {
  const xField = spec.config.xAxisKey ?? "";
  const series = spec.config.series ?? [];
  const yField = series[0]?.dataKey ?? "";
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const seriesToRender = stacked && series.length > 1 ? series : series.slice(0, 1);
  const config: ChartConfig = Object.fromEntries(
    seriesToRender.map((s, i) => [
      s.dataKey,
      { label: s.label ?? s.dataKey, color: `var(--chart-${(i % 5) + 1})` },
    ]),
  );

  const selectedKeys = new Set(
    selectedItems
      ?.filter((s) => s.widgetId === widgetId)
      .map((s) =>
        String((s.payload as Record<string, unknown>)[xField] ?? ""),
      ),
  );

  const yDomain = ((): [number | "auto", number | "auto"] => {
    const values = data
      .map((d) => Number(d[yField]))
      .filter((v) => Number.isFinite(v));
    if (values.length < 2) return ["auto", "auto"];
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (!(max > 0) || min < 0) return ["auto", "auto"];
    const spread = max - min;
    if (spread === 0) return ["auto", "auto"];
    if (min / max <= 0.5) return ["auto", "auto"];
    const lower = Math.max(0, min - spread * 0.25);
    const upper = max + spread * 0.15;
    return [lower, upper];
  })();

  useEffect(() => {
    const root = wrapRef.current;
    if (!root) return;
    const done = new Set<string>();
    let timer: number | null = null;
    const animate = () => {
      const rects = root.querySelectorAll<SVGRectElement>(
        '[data-kind="bar"] rect',
      );
      rects.forEach((rect, idx) => {
        const g = rect.parentElement;
        const uid = g?.getAttribute("data-uid") ?? "";
        if (!uid) return;
        const h = Number(rect.getAttribute("height"));
        if (!Number.isFinite(h) || h <= 0) return;
        if (done.has(uid)) {
          if (rect.style.transform !== "scaleY(1)") {
            rect.style.transformBox = "fill-box";
            rect.style.transformOrigin = "bottom";
            rect.style.transition = "none";
            rect.style.transform = "scaleY(1)";
          }
          return;
        }
        done.add(uid);
        rect.style.transformBox = "fill-box";
        rect.style.transformOrigin = "bottom";
        rect.style.transition = "none";
        rect.style.transform = "scaleY(0)";
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            rect.style.transition = `transform 700ms cubic-bezier(0.22, 1, 0.36, 1) ${idx * 50}ms`;
            rect.style.transform = "scaleY(1)";
          });
        });
      });
    };
    const schedule = () => {
      if (timer != null) clearTimeout(timer);
      timer = window.setTimeout(animate, 80);
    };
    schedule();
    const obs = new MutationObserver(schedule);
    obs.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["height", "y"],
    });
    return () => {
      if (timer != null) clearTimeout(timer);
      obs.disconnect();
    };
  }, []);

  return (
    <div ref={wrapRef} className="h-full w-full">
    <ChartContainer config={config} className="h-full w-full">
        <RechartsBarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey={xField}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            fontSize={11}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={56}
            domain={yDomain}
            allowDataOverflow={false}
            tickFormatter={(v) => formatValue(v, series[0]?.format)}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          {seriesToRender.map((s, sIdx) => (
            <Bar
              key={s.dataKey}
              dataKey={s.dataKey}
              stackId={stacked ? "a" : undefined}
              radius={
                stacked
                  ? sIdx === seriesToRender.length - 1
                    ? [4, 4, 0, 0]
                    : [0, 0, 0, 0]
                  : [4, 4, 0, 0]
              }
              cursor="pointer"
              isAnimationActive={false}
              shape={(props: unknown) => {
                const p = props as {
                  x: number;
                  y: number;
                  width: number;
                  height: number;
                  payload: Record<string, unknown>;
                };
                const row = p.payload;
                const xVal = String(row[xField] ?? "");
                const isSel = selectedKeys.has(xVal);
                const fallback = `var(--chart-${(sIdx % 5) + 1})`;
                const fill = isSel ? "var(--chart-2)" : `var(--color-${s.dataKey}, ${fallback})`;
                const stroke = isSel ? "var(--foreground)" : "none";
                const strokeWidth = isSel ? 2 : 0;
                return (
                  <g
                    data-selectable={sIdx === 0 ? "" : undefined}
                    data-kind={sIdx === 0 ? "bar" : undefined}
                    data-uid={sIdx === 0 ? `${widgetId}:bar:${xVal}` : undefined}
                    data-widget-id={sIdx === 0 ? widgetId : undefined}
                    data-widget-title={sIdx === 0 ? widgetTitle : undefined}
                    data-label={sIdx === 0 ? `${xField}=${xVal}` : undefined}
                    data-payload={sIdx === 0 ? JSON.stringify(row) : undefined}
                  >
                    <rect
                      x={p.x}
                      y={p.y}
                      width={p.width}
                      height={p.height}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      rx={4}
                      ry={4}
                    />
                  </g>
                );
              }}
              onClick={(payload) => {
                if (!onSelectItem) return;
                const rec = payload as unknown as Record<string, unknown>;
                const row = (rec.payload as Record<string, unknown>) ?? rec;
                const xVal = String(row[xField] ?? rec[xField] ?? "");
                onSelectItem({
                  uid: `${widgetId}:bar:${xVal}`,
                  widgetId,
                  widgetTitle,
                  kind: "bar",
                  label: `${xField}=${xVal}`,
                  payload: row,
                });
              }}
            />
          ))}
        </RechartsBarChart>
      </ChartContainer>
    </div>
  );
}
