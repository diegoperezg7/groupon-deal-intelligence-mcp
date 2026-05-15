/**
 * Wire types shared between the BFF and the frontend.
 *
 * The SSE event stream the BFF emits over POST /chat:
 *
 *   event: text         → assistant text token(s)   { chunk: string }
 *   event: tool_call    → LLM invoking a tool        { id, name, arguments }
 *   event: tool_result  → MCP returned               { id, name, ok, snippet }
 *   event: error        → fatal error in this turn   { message }
 *   event: done         → end of turn (close)        {}
 *
 * The frontend reads these and updates the Zustand store accordingly.
 */

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  toolCalls?: ToolCallSummary[];
}

export interface ToolCallSummary {
  id: string;
  name: string;
  /** Stringified args (raw JSON from the LLM). */
  arguments: string;
  status: "pending" | "ok" | "error";
  /** Short human-readable result snippet shown in the UI. */
  snippet?: string;
}

export interface ChatRequestBody {
  messages: ChatMessage[];
}

export type SseEvent =
  | { event: "text"; data: { chunk: string } }
  | { event: "tool_call"; data: { id: string; name: string; arguments: string } }
  | { event: "tool_result"; data: { id: string; name: string; ok: boolean; snippet: string } }
  | { event: "error"; data: { message: string } }
  | { event: "done"; data: Record<string, never> };
