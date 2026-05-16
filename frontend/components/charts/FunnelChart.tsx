"use client";

import {
  Cell,
  Funnel,
  FunnelChart as RechartsFunnelChart,
  LabelList,
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

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function FunnelChart({
  spec,
  data,
  widgetId,
  widgetTitle,
  selectedItems,
  onSelectItem,
}: Props) {
  const labelField = spec.config.xAxisKey ?? "stage";
  const valueField =
    spec.config.valueKey ?? spec.config.series[0]?.dataKey ?? "value";
  const fmt = spec.config.series[0]?.format;

  const config: ChartConfig = Object.fromEntries(
    data.map((row, i) => [
      String(row[labelField] ?? `stage-${i}`),
      {
        label: String(row[labelField] ?? `stage-${i}`),
        color: PALETTE[i % PALETTE.length],
      },
    ]),
  );

  const enriched = data.map((row, i) => ({
    ...row,
    __fill: PALETTE[i % PALETTE.length],
    __label: `${row[labelField]}: ${formatValue(row[valueField], fmt)}`,
  }));

  const selectedUids = new Set(
    selectedItems
      ?.filter((s) => s.widgetId === widgetId)
      .map((s) => s.uid),
  );

  return (
    <div className="h-full w-full">
      <ChartContainer config={config} className="h-full w-full">
        <RechartsFunnelChart>
          <ChartTooltip content={<ChartTooltipContent />} />
          <Funnel
            dataKey={valueField}
            data={enriched}
            isAnimationActive={false}
            stroke="var(--card)"
            onClick={(payload) => {
              if (!onSelectItem) return;
              const row =
                ((payload as unknown as { payload?: Record<string, unknown> })
                  .payload as Record<string, unknown>) ??
                (payload as unknown as Record<string, unknown>);
              const stage = String(row[labelField] ?? "");
              onSelectItem({
                uid: `${widgetId}:stage:${stage}`,
                widgetId,
                widgetTitle,
                kind: "stage",
                label: `${labelField}=${stage}`,
                payload: row,
              });
            }}
          >
            {enriched.map((row, i) => {
              const stage = String(row[labelField] ?? `stage-${i}`);
              const uid = `${widgetId}:stage:${stage}`;
              const isSel = selectedUids.has(uid);
              const fill = (row.__fill as string) ?? PALETTE[i % PALETTE.length];
              return (
                <Cell
                  key={uid}
                  fill={isSel ? "var(--chart-2)" : fill}
                  stroke={isSel ? "var(--foreground)" : "var(--card)"}
                  strokeWidth={isSel ? 2 : 1}
                />
              );
            })}
            <LabelList
              position="right"
              dataKey="__label"
              stroke="none"
              fill="var(--foreground)"
              fontSize={11}
            />
          </Funnel>
        </RechartsFunnelChart>
      </ChartContainer>
    </div>
  );
}
