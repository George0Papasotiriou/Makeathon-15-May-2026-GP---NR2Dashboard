import { env } from "@/lib/env";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel =
  env.NEXT_PUBLIC_LOG_LEVEL ??
  (env.NEXT_PUBLIC_ENV === "production" ? "info" : "debug");

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function format(
  module: string,
  level: LogLevel,
  msg: string,
  data?: unknown,
): string {
  const ts = new Date().toISOString().split("T")[1]?.replace("Z", "") ?? "";
  const prefix = `[${ts}] [${level.toUpperCase()}] [${module}]`;
  return data === undefined
    ? `${prefix} ${msg}`
    : `${prefix} ${msg} ${JSON.stringify(data)}`;
}

export function createLogger(module: string) {
  return {
    debug: (msg: string, data?: unknown) => {
      if (shouldLog("debug")) console.debug(format(module, "debug", msg, data));
    },
    info: (msg: string, data?: unknown) => {
      if (shouldLog("info")) console.info(format(module, "info", msg, data));
    },
    warn: (msg: string, data?: unknown) => {
      if (shouldLog("warn")) console.warn(format(module, "warn", msg, data));
    },
    error: (msg: string, data?: unknown) => {
      if (shouldLog("error")) console.error(format(module, "error", msg, data));
    },
  };
}
