"use client";

import { useMemo } from "react";

import type { ChartSpec } from "@/lib/api-types";
import { formatValue } from "@/lib/format";

type Props = {
  spec: ChartSpec;
  data: Array<Record<string, unknown>>;
};

const MARGIN = { top: 16, right: 16, bottom: 40, left: 56 };

type FieldMap = {
  min: string;
  q1: string;
  median: string;
  q3: string;
  max: string;
};

function resolveFields(spec: ChartSpec): FieldMap {
  const m: FieldMap = {
    min: "min",
    q1: "q1",
    median: "median",
    q3: "q3",
    max: "max",
  };
  for (const s of spec.config.series) {
    if (s.quartile) m[s.quartile] = s.dataKey;
  }
  return m;
}

export function BoxPlot({ spec, data }: Props) {
  const groupField = spec.config.xAxisKey ?? "group";
  const fields = resolveFields(spec);
  const fmt = spec.config.series[0]?.format;

  const { groups, yMin, yMax } = useMemo(() => {
    const gs: Array<{
      group: string;
      min: number;
      q1: number;
      median: number;
      q3: number;
      max: number;
    }> = [];
    let lo = Infinity;
    let hi = -Infinity;
    for (const row of data) {
      const mn = Number(row[fields.min]);
      const q1 = Number(row[fields.q1]);
      const md = Number(row[fields.median]);
      const q3 = Number(row[fields.q3]);
      const mx = Number(row[fields.max]);
      if (![mn, q1, md, q3, mx].every(Number.isFinite)) continue;
      gs.push({
        group: String(row[groupField] ?? ""),
        min: mn,
        q1,
        median: md,
        q3,
        max: mx,
      });
      lo = Math.min(lo, mn);
      hi = Math.max(hi, mx);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      lo = 0;
      hi = 1;
    }
    const pad = (hi - lo) * 0.05 || 1;
    return { groups: gs, yMin: lo - pad, yMax: hi + pad };
  }, [data, fields, groupField]);

  const W = 800;
  const H = 400;
  const innerW = W - MARGIN.left - MARGIN.right;
  const innerH = H - MARGIN.top - MARGIN.bottom;
  const groupW = groups.length ? innerW / groups.length : 0;
  const boxW = Math.min(groupW * 0.6, 60);
  const yScale = (v: number) =>
    innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const ticks = 4;
  const tickValues = Array.from({ length: ticks + 1 }, (_, i) =>
    yMin + ((yMax - yMin) * i) / ticks,
  );

  return (
    <div className="h-full w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      >
        <g transform={`translate(${MARGIN.left} ${MARGIN.top})`}>
          {tickValues.map((tv) => (
            <g key={tv} transform={`translate(0 ${yScale(tv)})`}>
              <line
                x1={0}
                x2={innerW}
                stroke="var(--border)"
                strokeDasharray="3 3"
                opacity={0.4}
              />
              <text
                x={-8}
                y={3}
                fontSize={11}
                textAnchor="end"
                fill="currentColor"
                opacity={0.7}
              >
                {formatValue(tv, fmt)}
              </text>
            </g>
          ))}
          {groups.map((g, i) => {
            const cx = i * groupW + groupW / 2;
            const x0 = cx - boxW / 2;
            return (
              <g key={g.group}>
                <line
                  x1={cx}
                  x2={cx}
                  y1={yScale(g.max)}
                  y2={yScale(g.min)}
                  stroke="var(--foreground)"
                  strokeWidth={1}
                  opacity={0.6}
                />
                <line
                  x1={cx - 10}
                  x2={cx + 10}
                  y1={yScale(g.max)}
                  y2={yScale(g.max)}
                  stroke="var(--foreground)"
                  strokeWidth={1}
                />
                <line
                  x1={cx - 10}
                  x2={cx + 10}
                  y1={yScale(g.min)}
                  y2={yScale(g.min)}
                  stroke="var(--foreground)"
                  strokeWidth={1}
                />
                <rect
                  x={x0}
                  y={yScale(g.q3)}
                  width={boxW}
                  height={Math.max(yScale(g.q1) - yScale(g.q3), 1)}
                  fill="var(--chart-1)"
                  fillOpacity={0.35}
                  stroke="var(--chart-1)"
                  strokeWidth={1}
                />
                <line
                  x1={x0}
                  x2={x0 + boxW}
                  y1={yScale(g.median)}
                  y2={yScale(g.median)}
                  stroke="var(--foreground)"
                  strokeWidth={2}
                />
                <text
                  x={cx}
                  y={innerH + 18}
                  fontSize={11}
                  textAnchor="middle"
                  fill="currentColor"
                  opacity={0.7}
                >
                  {g.group}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
