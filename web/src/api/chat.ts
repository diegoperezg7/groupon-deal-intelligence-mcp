import { SseParser } from "../lib/parseSSE";

interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamHandlers {
  onText?: (chunk: string) => void;
  onToolCall?: (call: { id: string; name: string; arguments: string }) => void;
  onToolResult?: (id: string, ok: boolean, snippet: string) => void;
  onError?: (message: string) => void;
}

/**
 * Drive POST /chat as an SSE stream and dispatch events to the handlers.
 * Returns when the server emits `event: done` or the connection closes.
 */
export async function streamChat(
  messages: ChatHistoryMessage[],
  handlers: StreamHandlers,
): Promise<void> {
  const resp = await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ messages }),
  });
  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Chat request failed: ${resp.status} ${text || resp.statusText}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const frame of parser.feed(chunk)) {
      dispatch(frame, handlers);
    }
  }
  for (const frame of parser.flush()) dispatch(frame, handlers);
}

function dispatch(frame: { event: string; data: string }, h: StreamHandlers): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(frame.data);
  } catch {
    return;
  }
  const data = parsed as Record<string, unknown>;
  switch (frame.event) {
    case "text":
      if (typeof data.chunk === "string") h.onText?.(data.chunk);
      break;
    case "tool_call":
      if (typeof data.id === "string" && typeof data.name === "string") {
        h.onToolCall?.({
          id: data.id,
          name: data.name,
          arguments: typeof data.arguments === "string" ? data.arguments : "",
        });
      }
      break;
    case "tool_result":
      if (typeof data.id === "string") {
        h.onToolResult?.(data.id, !!data.ok, typeof data.snippet === "string" ? data.snippet : "");
      }
      break;
    case "error":
      if (typeof data.message === "string") h.onError?.(data.message);
      break;
    case "done":
      // No-op; the loop exits when the stream ends.
      break;
  }
}
