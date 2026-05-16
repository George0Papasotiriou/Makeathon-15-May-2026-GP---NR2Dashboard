"use client";

import { useEffect, useRef } from "react";
import { Cell, Pie, PieChart as RechartsPieChart } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ChartSpec, SelectedItem } from "@/lib/api-types";

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
];

type Props = {
  spec: ChartSpec;
  data: Array<Record<string, unknown>>;
  widgetId: string;
  widgetTitle: string;
  selectedItems?: SelectedItem[];
  onSelectItem?: (item: SelectedItem) => void;
};

export function PieChart({
  spec,
  data,
  widgetId,
  widgetTitle,
  selectedItems,
  onSelectItem,
}: Props) {
  const labelField = spec.config.xAxisKey ?? "label";
  const valueField = spec.config.series[0]?.dataKey ?? "value";
  const innerRadius = "40%";
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const config: ChartConfig = Object.fromEntries(
    data.map((row, i) => [
      String(row[labelField] ?? `slice-${i}`),
      {
        label: String(row[labelField] ?? `slice-${i}`),
        color: PALETTE[i % PALETTE.length],
      },
    ]),
  );

  const selectedKeys = new Set(
    selectedItems
      ?.filter((s) => s.widgetId === widgetId)
      .map((s) =>
        String((s.payload as Record<string, unknown>)[labelField] ?? ""),
      ),
  );

  useEffect(() => {
    const root = wrapRef.current;
    if (!root) return;
    const done = new Set<string>();
    let timer: number | null = null;
    const animate = () => {
      const slices = root.querySelectorAll<SVGGElement>(
        '[data-kind="slice"]',
      );
      slices.forEach((g, idx) => {
        const uid = g.getAttribute("data-uid") ?? "";
        if (!uid) return;
        const sectorPath = g.querySelector("path");
        if (!sectorPath || !sectorPath.getAttribute("d")) return;
        if (done.has(uid)) {
          if (g.style.opacity !== "1") {
            g.style.transition = "none";
            g.style.opacity = "1";
            g.style.transform = "none";
          }
          return;
        }
        done.add(uid);
        g.style.transition = "none";
        g.style.opacity = "0";
        g.style.transformBox = "fill-box";
        g.style.transformOrigin = "center";
        g.style.transform = "scale(0.7)";
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const delay = idx * 80;
            g.style.transition = `opacity 550ms ease-out ${delay}ms, transform 650ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`;
            g.style.opacity = "1";
            g.style.transform = "scale(1)";
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
        <RechartsPieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Pie
            data={data}
            dataKey={valueField}
            nameKey={labelField}
            innerRadius={innerRadius}
            outerRadius="75%"
            strokeWidth={2}
            cursor="pointer"
            isAnimationActive={false}
            onClick={(payload) => {
              if (!onSelectItem) return;
              const rec = payload as unknown as Record<string, unknown>;
              const row = (rec.payload as Record<string, unknown>) ?? rec;
              const lblVal = String(row[labelField] ?? rec[labelField] ?? "");
              onSelectItem({
                uid: `${widgetId}:slice:${lblVal}`,
                widgetId,
                widgetTitle,
                kind: "slice",
                label: `${labelField}=${lblVal}`,
                payload: row,
              });
            }}
          >
            {data.map((row, i) => {
              const lbl = String(row[labelField] ?? `slice-${i}`);
              const isSel = selectedKeys.has(lbl);
              return (
                <Cell
                  key={`${lbl}-${i}`}
                  fill={PALETTE[i % PALETTE.length]}
                  stroke={isSel ? "var(--foreground)" : "var(--card)"}
                  strokeWidth={isSel ? 3 : 2}
                  opacity={selectedKeys.size > 0 && !isSel ? 0.45 : 1}
                />
              );
            })}
          </Pie>
        </RechartsPieChart>
      </ChartContainer>
    </div>
  );
}
