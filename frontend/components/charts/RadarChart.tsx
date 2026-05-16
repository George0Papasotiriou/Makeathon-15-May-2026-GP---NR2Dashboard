"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RechartsRadarChart,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ChartSpec } from "@/lib/api-types";

type Props = {
  spec: ChartSpec;
  data: Array<Record<string, unknown>>;
};

export function RadarChart({ spec, data }: Props) {
  const axisField = spec.config.xAxisKey ?? "axis";
  const series = spec.config.series ?? [];

  const config: ChartConfig = Object.fromEntries(
    series.map((s, i) => [
      s.dataKey,
      { label: s.label ?? s.dataKey, color: `var(--chart-${(i % 5) + 1})` },
    ]),
  );

  return (
    <div className="h-full w-full">
      <ChartContainer config={config} className="h-full w-full">
        <RechartsRadarChart data={data} outerRadius="75%">
          <PolarGrid />
          <PolarAngleAxis dataKey={axisField} fontSize={11} />
          <PolarRadiusAxis fontSize={10} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {series.map((s, i) => {
            const color = `var(--color-${s.dataKey}, var(--chart-${(i % 5) + 1}))`;
            return (
              <Radar
                key={s.dataKey}
                dataKey={s.dataKey}
                stroke={color}
                fill={color}
                fillOpacity={0.18}
                isAnimationActive={false}
              />
            );
          })}
        </RechartsRadarChart>
      </ChartContainer>
    </div>
  );
}
