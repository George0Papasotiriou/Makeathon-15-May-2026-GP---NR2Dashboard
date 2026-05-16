"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
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
};

export function ComboChart({ spec, data }: Props) {
  const xField = spec.config.xAxisKey ?? "";
  const series = spec.config.series ?? [];

  const config: ChartConfig = Object.fromEntries(
    series.map((s, i) => [
      s.dataKey,
      { label: s.label ?? s.dataKey, color: `var(--chart-${(i % 5) + 1})` },
    ]),
  );

  const hasRight = series.some((s) => s.yAxisId === "right");
  const leftFmt = series.find((s) => (s.yAxisId ?? "left") === "left")?.format;
  const rightFmt = series.find((s) => s.yAxisId === "right")?.format;

  return (
    <div className="h-full w-full">
      <ChartContainer config={config} className="h-full w-full">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
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
            yAxisId="left"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={56}
            tickFormatter={(v) => formatValue(v, leftFmt)}
          />
          {hasRight && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              width={56}
              tickFormatter={(v) => formatValue(v, rightFmt)}
            />
          )}
          <ChartTooltip content={<ChartTooltipContent />} />
          {series.map((s, i) => {
            const kind = s.chartKind ?? "bar";
            const axis = s.yAxisId ?? "left";
            const color = `var(--color-${s.dataKey}, var(--chart-${(i % 5) + 1}))`;
            if (kind === "line") {
              return (
                <Line
                  key={s.dataKey}
                  yAxisId={axis}
                  dataKey={s.dataKey}
                  type="monotone"
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              );
            }
            if (kind === "area") {
              return (
                <Area
                  key={s.dataKey}
                  yAxisId={axis}
                  dataKey={s.dataKey}
                  type="monotone"
                  stroke={color}
                  fill={color}
                  fillOpacity={0.2}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              );
            }
            return (
              <Bar
                key={s.dataKey}
                yAxisId={axis}
                dataKey={s.dataKey}
                fill={color}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            );
          })}
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}
