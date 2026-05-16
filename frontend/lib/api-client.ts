import { authHeaders, clearStoredAuthKey, emitAuthInvalid } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  EditorialResponseSchema,
  queryResponseSchema,
  type EditorialResponse,
  type QueryResponse,
  type StreamEvent,
} from "@/lib/api-types";
import { createLogger } from "@/lib/logger";

const log = createLogger("api-client");

function generateRequestId(): string {
  return crypto.randomUUID();
}

function handleAuthFailure(res: Response): void {
  if (res.status === 401) {
    clearStoredAuthKey();
    emitAuthInvalid();
  }
}

/** Non-streaming POST /api/query. */
export async function postQuery(
  question: string,
  conversationId: string,
): Promise<QueryResponse> {
  const requestId = generateRequestId();
  const url = `${env.NEXT_PUBLIC_BACKEND_URL}/api/query`;
  log.info("Submitting query", {
    request_id: requestId,
    question_len: question.length,
    conversation_id: conversationId,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      ...authHeaders(),
    },
    body: JSON.stringify({ question, conversation_id: conversationId }),
  });
  if (!res.ok) {
    handleAuthFailure(res);
    throw new Error(`Query failed: ${res.status} ${await res.text()}`);
  }
  return queryResponseSchema.parse(await res.json());
}

/**
 * Streaming POST /api/query/stream. Yields StreamEvent items.
 *
 * Server emits SSE frames like:
 *   event: sql
 *   data: {"widget_index": 0, "ch": "S"}
 *
 * Minimal hand-rolled SSE parser (no EventSource — that's GET-only).
 */
export async function* queryStream(
  question: string,
  conversationId: string,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const url = `${env.NEXT_PUBLIC_BACKEND_URL}/api/query/stream`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": generateRequestId(),
      ...authHeaders(),
    },
    body: JSON.stringify({ question, conversation_id: conversationId }),
    signal,
  });

  if (!res.ok || !res.body) {
    handleAuthFailure(res);
    throw new Error(`Stream failed: ${res.status} ${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let frameEnd: number;
    while ((frameEnd = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + 2);

      let eventName = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;

      try {
        const parsed = JSON.parse(data);
        const evt = toStreamEvent(eventName, parsed);
        if (evt) yield evt;
      } catch {
        /* skip malformed frame */
      }
    }
  }
}

function toStreamEvent(eventName: string, data: unknown): StreamEvent | null {
  const d = data as Record<string, unknown>;
  switch (eventName) {
    case "start":
      return { kind: "start", question: String(d.question ?? "") };
    case "sql_start":
      return {
        kind: "sql_start",
        widgetIndex: Number(d.widget_index ?? 0),
        widgetId: String(d.widget_id ?? ""),
      };
    case "sql":
      return {
        kind: "sql",
        widgetIndex: Number(d.widget_index ?? 0),
        ch: String(d.ch ?? ""),
      };
    case "sql_end":
      return { kind: "sql_end", widgetIndex: Number(d.widget_index ?? 0) };
    case "done": {
      const payload = queryResponseSchema.parse(data);
      return { kind: "done", payload };
    }
    case "error":
      return { kind: "error", error: String(d.error ?? "unknown error") };
    default:
      return null;
  }
}

export async function generateEditorial(
  conversationId: string,
): Promise<EditorialResponse> {
  const url = `${env.NEXT_PUBLIC_BACKEND_URL}/api/editorial`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ conversation_id: conversationId }),
  });
  if (!res.ok) {
    handleAuthFailure(res);
    const detail = await res.json().catch(() => ({}));
    const message =
      typeof detail === "object" &&
      detail !== null &&
      "detail" in detail &&
      typeof (detail as { detail: unknown }).detail === "object" &&
      (detail as { detail: { message?: unknown } }).detail !== null &&
      typeof (detail as { detail: { message?: unknown } }).detail.message ===
        "string"
        ? (detail as { detail: { message: string } }).detail.message
        : `Editorial generation failed (${res.status})`;
    throw new Error(message);
  }
  return EditorialResponseSchema.parse(await res.json());
}

export async function resetConversation(conversationId: string): Promise<void> {
  const url = `${env.NEXT_PUBLIC_BACKEND_URL}/api/conversations/${conversationId}/reset`;
  await fetch(url, { method: "POST", headers: { ...authHeaders() } }).catch((err) => {
    log.warn("Reset network error", {
      conversation_id: conversationId,
      error: String(err),
    });
  });
}
