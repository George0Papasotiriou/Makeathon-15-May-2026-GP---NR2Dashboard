import { z } from "zod";

// Discriminated union for every JSON frame the voice WS may send.
// Binary frames (audio bytes) are routed separately — never reach here.

const sessionStartedSchema = z.object({
  type: z.literal("session_started"),
  session_id: z.string(),
  conversation_id: z.string(),
});

const transcriptSchema = z.object({
  type: z.literal("transcript"),
  source: z.enum(["user", "agent"]),
  text: z.string(),
});

const chartReadySchema = z.object({
  type: z.literal("chart_ready"),
  chart_id: z.string(),
  chart_spec: z.unknown(),
  data: z.array(z.record(z.string(), z.unknown())),
  panel_data: z
    .array(z.array(z.record(z.string(), z.unknown())))
    .nullable()
    .optional(),
  explanation: z.string(),
});

const interruptedSchema = z.object({
  type: z.literal("interrupted"),
});

const turnCompleteSchema = z.object({
  type: z.literal("turn_complete"),
});

const sessionEndedSchema = z.object({
  type: z.literal("session_ended"),
  reason: z.string().optional(),
});

const sessionErrorSchema = z.object({
  type: z.literal("session_error"),
  message: z.string(),
});

export const voiceMessageSchema = z.discriminatedUnion("type", [
  sessionStartedSchema,
  transcriptSchema,
  chartReadySchema,
  interruptedSchema,
  turnCompleteSchema,
  sessionEndedSchema,
  sessionErrorSchema,
]);

export type VoiceMessage = z.infer<typeof voiceMessageSchema>;
export type ChartReadyMessage = z.infer<typeof chartReadySchema>;
