import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_BACKEND_URL: z.string().url().default("http://localhost:8000"),
  NEXT_PUBLIC_ENV: z.enum(["development", "production"]).default("development"),
  NEXT_PUBLIC_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
  NEXT_PUBLIC_VOICE_WS_URL: z.string().optional(),
});

function parseEnv() {
  try {
    const parsed = envSchema.parse({
      NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
      NEXT_PUBLIC_ENV: process.env.NEXT_PUBLIC_ENV,
      NEXT_PUBLIC_LOG_LEVEL: process.env.NEXT_PUBLIC_LOG_LEVEL,
      NEXT_PUBLIC_VOICE_WS_URL: process.env.NEXT_PUBLIC_VOICE_WS_URL,
    });
    console.info("[env] Validation passed");
    return parsed;
  } catch (err) {
    console.error("[env] Validation FAILED", err);
    throw err;
  }
}

export const env = parseEnv();
