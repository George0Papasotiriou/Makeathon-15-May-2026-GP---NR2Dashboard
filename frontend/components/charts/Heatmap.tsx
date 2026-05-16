"use client";

import { useMemo } from "react";

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

const MARGIN = { top: 24, right: 16, bottom: 40, left: 80 };

export function Heatmap({
  spec,
  data,
  widgetId,
  widgetTitle,
  selectedItems,
  onSelectItem,
}: Props) {
  const xField = spec.config.xAxisKey ?? "x";
  const yField = spec.config.yAxisKey ?? "y";
  const valueField =
    spec.config.valueKey ?? spec.config.series[0]?.dataKey ?? "value";
  const fmt = spec.config.series[0]?.format;

  const { xKeys, yKeys, valueByCell, minV, maxV } = useMemo(() => {
    const xSet = new Set<string>();
    const ySet = new Set<string>();
    const cells = new Map<string, number>();
    let min = Infinity;
    let max = -Infinity;
    for (const row of data) {
      const xv = String(row[xField] ?? "");
      const yv = String(row[yField] ?? "");
      const v = Number(row[valueField]);
      xSet.add(xv);
      ySet.add(yv);
      if (Number.isFinite(v)) {
        cells.set(`${xv}|${yv}`, v);
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return {
      xKeys: Array.from(xSet).sort(),
      yKeys: Array.from(ySet).sort(),
      valueByCell: cells,
      minV: Number.isFinite(min) ? min : 0,
      maxV: Number.isFinite(max) ? max : 1,
    };
  }, [data, xField, yField, valueField]);

  const selectedUids = new Set(
    selectedItems
      ?.filter((s) => s.widgetId === widgetId)
      .map((s) => s.uid),
  );

  const interpolate = (v: number): string => {
    if (maxV === minV) return "var(--chart-1)";
    const t = (v - minV) / (maxV - minV);
    const alpha = 0.15 + t * 0.85;
    return `color-mix(in oklab, var(--chart-1) ${Math.round(alpha * 100)}%, var(--background))`;
  };

  return (
    <div className="h-full w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${800} ${400}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      >
        {(() => {
          const innerW = 800 - MARGIN.left - MARGIN.right;
          const innerH = 400 - MARGIN.top - MARGIN.bottom;
          const cellW = xKeys.length ? innerW / xKeys.length : 0;
          const cellH = yKeys.length ? innerH / yKeys.length : 0;
          return (
            <g transform={`translate(${MARGIN.left} ${MARGIN.top})`}>
              {yKeys.map((y, yi) => (
                <text
                  key={`y-${y}`}
                  x={-8}
                  y={yi * cellH + cellH / 2}
                  fontSize={11}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="currentColor"
                  opacity={0.7}
                >
                  {y}
                </text>
              ))}
              {xKeys.map((x, xi) => (
                <text
                  key={`x-${x}`}
                  x={xi * cellW + cellW / 2}
                  y={innerH + 18}
                  fontSize={11}
                  textAnchor="middle"
                  fill="currentColor"
                  opacity={0.7}
                >
                  {x}
                </text>
              ))}
              {yKeys.flatMap((y, yi) =>
                xKeys.map((x, xi) => {
                  const v = valueByCell.get(`${x}|${y}`);
                  if (v === undefined) {
                    return (
                      <rect
                        key={`${x}|${y}`}
                        x={xi * cellW + 1}
                        y={yi * cellH + 1}
                        width={Math.max(cellW - 2, 0)}
                        height={Math.max(cellH - 2, 0)}
                        fill="transparent"
                        stroke="var(--border)"
                        strokeWidth={0.5}
                      />
                    );
                  }
                  const uid = `${widgetId}:cell:${x}|${y}`;
                  const isSel = selectedUids.has(uid);
                  const row = { [xField]: x, [yField]: y, [valueField]: v };
                  return (
                    <g
                      key={`${x}|${y}`}
                      data-selectable=""
                      data-kind="cell"
                      data-uid={uid}
                      data-widget-id={widgetId}
                      data-widget-title={widgetTitle}
                      data-label={`${x} × ${y} = ${formatValue(v, fmt)}`}
                      data-payload={JSON.stringify(row)}
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        onSelectItem?.({
                          uid,
                          widgetId,
                          widgetTitle,
                          kind: "cell",
                          label: `${x} × ${y} = ${formatValue(v, fmt)}`,
                          payload: row,
                        });
                      }}
                    >
                      <rect
                        x={xi * cellW + 1}
                        y={yi * cellH + 1}
                        width={Math.max(cellW - 2, 0)}
                        height={Math.max(cellH - 2, 0)}
                        fill={interpolate(v)}
                        stroke={isSel ? "var(--foreground)" : "transparent"}
                        strokeWidth={isSel ? 2 : 0}
                        rx={2}
                      />
                      <title>{`${x} × ${y}: ${formatValue(v, fmt)}`}</title>
                    </g>
                  );
                }),
              )}
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
