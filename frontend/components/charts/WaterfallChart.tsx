"use client";

import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
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

export function WaterfallChart({ spec, data }: Props) {
  const labelField = spec.config.xAxisKey ?? "label";
  const series = spec.config.series ?? [];
  const deltaField = series[0]?.dataKey ?? "delta";
  const fmt = series[0]?.format;

  const stepped = useMemo(() => {
    let running = 0;
    return data.map((row) => {
      const isTotal = Boolean(row.is_total);
      const delta = Number(row[deltaField]) || 0;
      const start = isTotal ? 0 : running;
      const end = isTotal ? delta : running + delta;
      if (!isTotal) running += delta;
      else running = delta;
      return {
        ...row,
        __base: Math.min(start, end),
        __delta: Math.abs(end - start),
        __sign: delta < 0 ? "neg" : "pos",
        __isTotal: isTotal,
      };
    });
  }, [data, deltaField]);

  const config: ChartConfig = {
    __delta: { label: series[0]?.label ?? deltaField, color: "var(--chart-1)" },
  };

  return (
    <div className="h-full w-full">
      <ChartContainer config={config} className="h-full w-full">
        <ComposedChart
          data={stepped}
          margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey={labelField}
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
            tickFormatter={(v) => formatValue(v, fmt)}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="__base" stackId="wf" fill="transparent" isAnimationActive={false} />
          <Bar
            dataKey="__delta"
            stackId="wf"
            isAnimationActive={false}
            radius={[4, 4, 0, 0]}
          >
            {stepped.map((row, i) => {
              const fill = row.__isTotal
                ? "var(--chart-3)"
                : row.__sign === "neg"
                  ? "var(--task-error)"
                  : "var(--chart-1)";
              return <Cell key={i} fill={fill} />;
            })}
          </Bar>
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}
