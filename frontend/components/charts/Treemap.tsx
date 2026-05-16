"use client";

import { Treemap as RechartsTreemap } from "recharts";

import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import type { ChartSpec, SelectedItem } from "@/lib/api-types";
import { formatValue } from "@/lib/format";

type Props = {
  spec: ChartSpec;
  data: Array<Record<string, unknown>>;
  widgetId: string;
  widgetTitle: string;
  selectedItems?: SelectedItem[];
  onSelectItem?: (item: SelectedItem) => void;
};

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function Treemap({
  spec,
  data,
  widgetId,
  widgetTitle,
  selectedItems,
  onSelectItem,
}: Props) {
  const nameField = spec.config.xAxisKey ?? "name";
  const valueField =
    spec.config.valueKey ?? spec.config.series[0]?.dataKey ?? "value";
  const fmt = spec.config.series[0]?.format;

  const items = data.map((row, i) => ({
    name: String(row[nameField] ?? `tile-${i}`),
    size: Number(row[valueField]) || 0,
    __row: row,
    __fill: PALETTE[i % PALETTE.length],
  }));

  const selectedUids = new Set(
    selectedItems
      ?.filter((s) => s.widgetId === widgetId)
      .map((s) => s.uid),
  );

  const chartConfig: ChartConfig = {
    size: { label: spec.config.series[0]?.label ?? "Value" },
  };

  return (
    <ChartContainer config={chartConfig} className="h-full w-full">
      <RechartsTreemap
        data={items}
        dataKey="size"
        nameKey="name"
        isAnimationActive={false}
        content={(props: unknown) => {
          const p = props as {
            x: number;
            y: number;
            width: number;
            height: number;
            name?: string;
            payload?: { __row?: Record<string, unknown>; __fill?: string };
            size?: number;
          };
          const row = (p.payload?.__row ?? {}) as Record<string, unknown>;
          const name = p.name ?? "";
          const uid = `${widgetId}:tile:${name}`;
          const isSel = selectedUids.has(uid);
          const fill = (p.payload?.__fill as string) ?? PALETTE[0];
          const showLabel = p.width > 60 && p.height > 24;
          return (
            <g
              data-selectable=""
              data-kind="tile"
              data-uid={uid}
              data-widget-id={widgetId}
              data-widget-title={widgetTitle}
              data-label={name}
              data-payload={JSON.stringify(row)}
              style={{ cursor: "pointer" }}
              onClick={() => {
                onSelectItem?.({
                  uid,
                  widgetId,
                  widgetTitle,
                  kind: "tile",
                  label: name,
                  payload: row,
                });
              }}
            >
              <rect
                x={p.x}
                y={p.y}
                width={p.width}
                height={p.height}
                fill={isSel ? "var(--chart-2)" : fill}
                stroke="var(--card)"
                strokeWidth={2}
              />
              {showLabel && (
                <text
                  x={p.x + 6}
                  y={p.y + 16}
                  fontSize={11}
                  fill="var(--foreground)"
                  pointerEvents="none"
                >
                  {name}
                </text>
              )}
              {showLabel && p.height > 40 && (
                <text
                  x={p.x + 6}
                  y={p.y + 32}
                  fontSize={11}
                  fill="var(--foreground)"
                  opacity={0.7}
                  pointerEvents="none"
                >
                  {formatValue(row[valueField], fmt)}
                </text>
              )}
            </g>
          );
        }}
      />
    </ChartContainer>
  );
}
