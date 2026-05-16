"use client";

import { useEffect, useRef } from "react";
import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ChartSpec } from "@/lib/api-types";
import { formatValue } from "@/lib/format";

type Props = {
  spec: ChartSpec;
  data: Array<Record<string, unknown>>;
  stacked?: boolean;
};

export function AreaChart({ spec, data, stacked }: Props) {
  const xField = spec.config.xAxisKey ?? "";
  const series = spec.config.series ?? [];
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const config: ChartConfig = Object.fromEntries(
    series.map((s, i) => [
      s.dataKey,
      { label: s.label ?? s.dataKey, color: `var(--chart-${(i % 5) + 1})` },
    ]),
  );

  useEffect(() => {
    const root = wrapRef.current;
    if (!root) return;
    let ran = false;
    let timer: number | null = null;
    const animate = () => {
      const curves = root.querySelectorAll<SVGPathElement>(
        ".recharts-area-curve",
      );
      const areas = root.querySelectorAll<SVGPathElement>(
        ".recharts-area-area",
      );
      if (curves.length === 0 || areas.length === 0) return;
      if (!curves[0].getAttribute("d")) return;
      if (ran) {
        curves.forEach((path) => {
          if (path.style.strokeDashoffset !== "0") {
            path.setAttribute("pathLength", "1");
            path.style.transition = "none";
            path.style.strokeDasharray = "1";
            path.style.strokeDashoffset = "0";
          }
        });
        areas.forEach((path) => {
          if (path.style.opacity !== "1") {
            path.style.transition = "none";
            path.style.opacity = "1";
          }
        });
        return;
      }
      ran = true;
      curves.forEach((path) => {
        path.setAttribute("pathLength", "1");
        path.style.transition = "none";
        path.style.strokeDasharray = "1";
        path.style.strokeDashoffset = "1";
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            path.style.transition =
              "stroke-dashoffset 1000ms cubic-bezier(0.22, 1, 0.36, 1)";
            path.style.strokeDashoffset = "0";
          });
        });
      });
      areas.forEach((path) => {
        path.style.transition = "none";
        path.style.opacity = "0";
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            path.style.transition = "opacity 1000ms ease-out";
            path.style.opacity = "1";
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
      attributeFilter: ["d"],
    });
    return () => {
      if (timer != null) clearTimeout(timer);
      obs.disconnect();
    };
  }, []);

  return (
    <div ref={wrapRef} className="h-full w-full">
      <ChartContainer config={config} className="h-full w-full">
        <RechartsAreaChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
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
            tickFormatter={(v) => formatValue(v, series[0]?.format)}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          {series.map((s, i) => (
            <Area
              key={s.dataKey}
              dataKey={s.dataKey}
              type="monotone"
              stroke={`var(--color-${s.dataKey}, var(--chart-${(i % 5) + 1}))`}
              fill={`var(--color-${s.dataKey}, var(--chart-${(i % 5) + 1}))`}
              fillOpacity={0.2}
              strokeWidth={2}
              stackId={stacked ? "a" : undefined}
              isAnimationActive={false}
            />
          ))}
        </RechartsAreaChart>
      </ChartContainer>
    </div>
  );
}
