"use client";

import { cn } from "@/lib/utils";
import type { SelectedItem } from "@/lib/api-types";

type Props = {
  columns: string[];
  data: Array<Record<string, unknown>>;
  widgetId: string;
  widgetTitle: string;
  selectedItems?: SelectedItem[];
  onSelectItem?: (item: SelectedItem) => void;
};

function renderCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    return Number.isInteger(v)
      ? v.toLocaleString()
      : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(v);
}

export function DataTable({
  columns,
  data,
  widgetId,
  widgetTitle,
  selectedItems,
  onSelectItem,
}: Props) {
  const selectedUids = new Set(selectedItems?.map((s) => s.uid));

  return (
    <div data-scrollable className="h-full w-full overflow-auto">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="sticky top-0 bg-background/90 backdrop-blur-sm">
          <tr className="border-b border-border/60">
            {columns.map((c) => (
              <th
                key={c}
                className="whitespace-nowrap px-3 py-2 text-xs font-medium text-muted-foreground"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const uid = `${widgetId}:row:${i}`;
            const isSel = selectedUids.has(uid);
            return (
              <tr
                key={i}
                data-selectable
                data-kind="row"
                data-uid={uid}
                data-widget-id={widgetId}
                data-widget-title={widgetTitle}
                data-label={`row #${i + 1}`}
                data-payload={JSON.stringify(row)}
                onClick={() =>
                  onSelectItem?.({
                    uid,
                    widgetId,
                    widgetTitle,
                    kind: "row",
                    label: `row #${i + 1}`,
                    payload: row,
                  })
                }
                className={cn(
                  "border-b border-border/30 last:border-0 cursor-pointer transition-colors hover:bg-primary/10",
                  isSel && "bg-primary/15",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c}
                    className="whitespace-nowrap px-3 py-2 tabular-nums"
                  >
                    {renderCell(row[c])}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
