"use client";

import type { ChartSpec } from "@/lib/api-types";
import { formatValue } from "@/lib/format";

type Props = {
  spec: ChartSpec;
  data: Array<Record<string, unknown>>;
};

export function GaugeChart({ spec, data }: Props) {
  const row = data[0] ?? {};
  const valueField =
    spec.config.valueKey ?? spec.config.series[0]?.dataKey ?? "value";
  const value = Number(row[valueField]) || 0;
  const max =
    spec.config.max ??
    (Number(row.max) || (Math.abs(value) <= 1 ? 1 : value * 1.25));
  const target = spec.config.target ?? (Number(row.target) || undefined);
  const fmt = spec.config.series[0]?.format;

  const pct = Math.max(0, Math.min(1, value / (max || 1)));
  const targetPct =
    target !== undefined ? Math.max(0, Math.min(1, target / (max || 1))) : null;

  // Half-circle: 180° → π radians.
  const cx = 100;
  const cy = 100;
  const r = 80;
  const stroke = 18;

  // Background arc from angle π (180°) to 2π (360°).
  const angleAt = (t: number) => Math.PI + Math.PI * t;
  const pointAt = (t: number) => {
    const a = angleAt(t);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  const bgStart = pointAt(0);
  const bgEnd = pointAt(1);
  const valEnd = pointAt(pct);
  const bgPath = `M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 0 1 ${bgEnd.x} ${bgEnd.y}`;
  const valPath = `M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${valEnd.x} ${valEnd.y}`;

  const fmtKind = fmt ?? (Math.abs(value) <= 1 ? "percentage" : "number");

  return (
    <div className="flex h-full w-full items-center justify-center">
      <svg viewBox="0 0 200 130" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        <path
          d={bgPath}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <path
          d={valPath}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {targetPct !== null && (() => {
          const tp = pointAt(targetPct);
          const inner = {
            x: cx + (r - stroke / 2 - 4) * Math.cos(angleAt(targetPct)),
            y: cy + (r - stroke / 2 - 4) * Math.sin(angleAt(targetPct)),
          };
          const outer = {
            x: cx + (r + stroke / 2 + 4) * Math.cos(angleAt(targetPct)),
            y: cy + (r + stroke / 2 + 4) * Math.sin(angleAt(targetPct)),
          };
          void tp;
          return (
            <line
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--foreground)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          );
        })()}
        <text
          x={cx}
          y={cy - 4}
          fontSize={24}
          fontWeight={600}
          textAnchor="middle"
          fill="currentColor"
        >
          {formatValue(value, fmtKind)}
        </text>
        {target !== undefined && (
          <text
            x={cx}
            y={cy + 16}
            fontSize={10}
            textAnchor="middle"
            fill="currentColor"
            opacity={0.6}
          >
            target {formatValue(target, fmtKind)}
          </text>
        )}
      </svg>
    </div>
  );
}
