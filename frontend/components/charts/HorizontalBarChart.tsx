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
  widgetId: string;
  widgetTitle: string;
  selectedItems?: SelectedItem[];
  onSelectItem?: (item: SelectedItem) => void;
};

export function HorizontalBarChart({
  spec,
  data,
  widgetId,
  widgetTitle,
  selectedItems,
  onSelectItem,
}: Props) {
  const yField = spec.config.xAxisKey ?? "";
  const series = spec.config.series ?? [];
  const xField = series[0]?.dataKey ?? "";

  const config: ChartConfig = {
    [xField]: { label: series[0]?.label ?? xField, color: "var(--chart-1)" },
  };

  const selectedKeys = new Set(
    selectedItems
      ?.filter((s) => s.widgetId === widgetId)
      .map((s) =>
        String((s.payload as Record<string, unknown>)[yField] ?? ""),
      ),
  );

  return (
    <div className="h-full w-full">
      <ChartContainer config={config} className="h-full w-full">
        <RechartsBarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
        >
          <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            tickFormatter={(v) => formatValue(v, series[0]?.format)}
          />
          <YAxis
            type="category"
            dataKey={yField}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={120}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar
            dataKey={xField}
            radius={[0, 4, 4, 0]}
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
              const yVal = String(row[yField] ?? "");
              const isSel = selectedKeys.has(yVal);
              const fill = isSel ? "var(--chart-2)" : `var(--color-${xField}, var(--chart-1))`;
              const stroke = isSel ? "var(--foreground)" : "none";
              const strokeWidth = isSel ? 2 : 0;
              return (
                <g
                  data-selectable=""
                  data-kind="bar"
                  data-uid={`${widgetId}:bar:${yVal}`}
                  data-widget-id={widgetId}
                  data-widget-title={widgetTitle}
                  data-label={`${yField}=${yVal}`}
                  data-payload={JSON.stringify(row)}
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
              const yVal = String(row[yField] ?? rec[yField] ?? "");
              onSelectItem({
                uid: `${widgetId}:bar:${yVal}`,
                widgetId,
                widgetTitle,
                kind: "bar",
                label: `${yField}=${yVal}`,
                payload: row,
              });
            }}
          />
        </RechartsBarChart>
      </ChartContainer>
    </div>
  );
}
