"use client";

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
  widgetId?: string;
  widgetTitle?: string;
  selectedItems?: SelectedItem[];
  onSelectItem?: (item: SelectedItem) => void;
};

export function Histogram({
  spec,
  data,
  widgetId = "histogram",
  widgetTitle = spec.title,
  selectedItems,
  onSelectItem,
}: Props) {
  const xField = spec.config.xAxisKey ?? "bin_label";
  const series = spec.config.series ?? [];
  const yField = series[0]?.dataKey ?? "count";

  const config: ChartConfig = {
    [yField]: { label: series[0]?.label ?? yField, color: "var(--chart-1)" },
  };

  const selectedUids = new Set(
    selectedItems
      ?.filter((s) => s.widgetId === widgetId)
      .map((s) => s.uid),
  );

  return (
    <div className="h-full w-full">
      <ChartContainer config={config} className="h-full w-full">
        <RechartsBarChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
          barCategoryGap={1}
        >
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
            domain={spec.config.max !== undefined ? [0, spec.config.max] : undefined}
            tickFormatter={(v) => formatValue(v, series[0]?.format ?? "number")}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar
            dataKey={yField}
            fill={`var(--color-${yField}, var(--chart-1))`}
            isAnimationActive={false}
            cursor="pointer"
            shape={(props: unknown) => {
              const p = props as {
                x: number;
                y: number;
                width: number;
                height: number;
                payload: Record<string, unknown>;
              };
              const row = p.payload;
              const bin = String(row[xField] ?? "");
              const uid = `${widgetId}:bar:${bin}`;
              const isSel = selectedUids.has(uid);
              return (
                <g
                  data-selectable=""
                  data-kind="bar"
                  data-uid={uid}
                  data-widget-id={widgetId}
                  data-widget-title={widgetTitle}
                  data-label={`${xField}=${bin}`}
                  data-payload={JSON.stringify(row)}
                >
                  <rect
                    x={p.x}
                    y={p.y}
                    width={p.width}
                    height={p.height}
                    fill={
                      isSel
                        ? "var(--chart-2)"
                        : `var(--color-${yField}, var(--chart-1))`
                    }
                    stroke={isSel ? "var(--foreground)" : "none"}
                    strokeWidth={isSel ? 2 : 0}
                  />
                </g>
              );
            }}
            onClick={(payload) => {
              if (!onSelectItem) return;
              const rec = payload as unknown as Record<string, unknown>;
              const row = (rec.payload as Record<string, unknown>) ?? rec;
              const bin = String(row[xField] ?? "");
              onSelectItem({
                uid: `${widgetId}:bar:${bin}`,
                widgetId,
                widgetTitle,
                kind: "bar",
                label: `${xField}=${bin}`,
                payload: row,
              });
            }}
          />
        </RechartsBarChart>
      </ChartContainer>
    </div>
  );
}
