"use client";

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

export function KPICard({
  spec,
  data,
  widgetId,
  widgetTitle,
  selectedItems,
  onSelectItem,
}: Props) {
  const series0 = spec.config.series[0];
  const valueField = series0?.dataKey ?? "value";
  const row = data[0] ?? {};
  const raw = row[valueField] ?? Object.values(row)[0];
  const display = formatValue(raw, series0?.format);

  const len = display.length;
  const sizeClass =
    len <= 4
      ? "text-4xl"
      : len <= 7
        ? "text-3xl"
        : len <= 10
          ? "text-2xl"
          : "text-xl";

  const uid = `${widgetId}:kpi`;
  const isSel = selectedItems?.some((s) => s.uid === uid);

  const handleClick = () => {
    if (!onSelectItem) return;
    onSelectItem({
      uid,
      widgetId,
      widgetTitle,
      kind: "kpi",
      label: `${spec.title}: ${display}`,
      payload: { value: raw, ...row },
    });
  };

  const payload = { value: raw, ...row };
  return (
    <div
      data-selectable
      data-kind="kpi"
      data-uid={uid}
      data-widget-id={widgetId}
      data-widget-title={widgetTitle}
      data-label={`${spec.title}: ${display}`}
      data-payload={JSON.stringify(payload)}
      className={cn(
        "flex h-full w-full min-w-0 flex-col justify-center overflow-hidden rounded-md cursor-pointer transition-colors hover:bg-primary/5",
        isSel && "bg-primary/10 ring-1 ring-primary/40",
      )}
      onClick={handleClick}
    >
      <div
        className={`${sizeClass} truncate font-semibold tracking-tight tabular-nums`}
        title={display}
      >
        {display}
      </div>
    </div>
  );
}
