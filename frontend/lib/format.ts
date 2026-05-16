type FormatKind =
  | "currency"
  | "percentage"
  | "number"
  | "duration"
  | "datetime"
  | undefined;

export function formatValue(value: unknown, kind: FormatKind): string {
  if (value === null || value === undefined) return "—";

  if (kind === "currency") {
    const n = Number(value);
    if (Number.isNaN(n)) return String(value);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }).format(n);
  }

  if (kind === "percentage") {
    const n = Number(value);
    if (Number.isNaN(n)) return String(value);
    // Backend may emit either 0.762 OR 76.2 depending on the SQL.
    // Values 0–1 are treated as ratios; values >1 are already %.
    const display = Math.abs(n) <= 1 ? n * 100 : n;
    return `${display.toFixed(1)}%`;
  }

  if (kind === "duration") {
    const seconds = Number(value);
    if (Number.isNaN(seconds)) return String(value);
    if (seconds < 60) return `${seconds.toFixed(0)}s`;
    const mins = Math.floor(seconds / 60);
    const rem = Math.round(seconds % 60);
    return `${mins}m ${rem}s`;
  }

  if (kind === "datetime") {
    if (typeof value === "string" && value.length > 0) return value;
    const d = new Date(value as string | number);
    if (!Number.isFinite(d.getTime())) return String(value);
    return d.toLocaleDateString();
  }

  // Default "number"
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  if (Math.abs(n) >= 1000) {
    return new Intl.NumberFormat("en-US").format(Math.round(n));
  }
  return n.toFixed(Number.isInteger(n) ? 0 : 2);
}
