"use client";

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";

import { cn } from "@/lib/utils";
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

export function SparklineKPI({
  spec,
  data,
  widgetId,
  widgetTitle,
  selectedItems,
  onSelectItem,
}: Props) {
  const series0 = spec.config.series[0];
  const metricField = series0?.dataKey ?? "metric";
  const fmt = series0?.format;

  const last = data[data.length - 1] ?? {};
  const first = data[0];
  const rawValue = last[metricField];
  const display = formatValue(rawValue, fmt);

  const delta =
    first && typeof first[metricField] === "number"
      ? Number(rawValue) - Number(first[metricField])
      : null;
  const deltaSign =
    delta === null ? "" : delta > 0 ? "▲" : delta < 0 ? "▼" : "·";
  const deltaColor =
    delta === null
      ? "var(--muted-foreground)"
      : delta > 0
        ? "var(--task-done)"
        : delta < 0
          ? "var(--task-error)"
          : "var(--muted-foreground)";

  const uid = `${widgetId}:kpi`;
  const isSel = selectedItems
    ?.filter((s) => s.widgetId === widgetId)
    .some((s) => s.uid === uid);

  const trendColor = `var(--color-${metricField}, var(--chart-1))`;

  return (
    <div
      data-selectable
      data-kind="kpi"
      data-uid={uid}
      data-widget-id={widgetId}
      data-widget-title={widgetTitle}
      data-label={`${spec.title}: ${display}`}
      data-payload={JSON.stringify({ value: rawValue, ...last })}
      className={cn(
        "flex h-full w-full min-w-0 flex-col gap-1 rounded-md cursor-pointer p-2 transition-colors hover:bg-primary/5",
        isSel && "bg-primary/10 ring-1 ring-primary/40",
      )}
      onClick={() => {
        onSelectItem?.({
          uid,
          widgetId,
          widgetTitle,
          kind: "kpi",
          label: `${spec.title}: ${display}`,
          payload: { value: rawValue, ...last },
        });
      }}
    >
      <div className="flex items-baseline gap-2">
        <span className="truncate text-3xl font-semibold tabular-nums" title={display}>
          {display}
        </span>
        {delta !== null && (
          <span
            className="text-xs font-medium tabular-nums"
            style={{ color: deltaColor }}
            title="delta first→last"
          >
            {deltaSign} {formatValue(Math.abs(delta), fmt)}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
          >
            <YAxis hide domain={["auto", "auto"]} />
            <Line
              dataKey={metricField}
              type="monotone"
              stroke={trendColor}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
