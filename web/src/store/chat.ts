import { create } from "zustand";
import { streamChat } from "../api/chat";

export type ChatRole = "user" | "assistant";

export interface ToolCallSummary {
  id: string;
  name: string;
  arguments: string;
  status: "pending" | "ok" | "error";
  snippet?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  toolCalls: ToolCallSummary[];
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  send: (text: string) => Promise<void>;
  reset: () => void;
}

let _id = 0;
const nextId = () => `m_${Date.now()}_${++_id}`;

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  error: null,

  reset: () => set({ messages: [], isStreaming: false, error: null }),

  send: async (text: string) => {
    if (!text.trim() || get().isStreaming) return;

    const userMsg: ChatMessage = {
      id: nextId(),
      role: "user",
      content: text.trim(),
      toolCalls: [],
    };
    const assistantMsg: ChatMessage = {
      id: nextId(),
      role: "assistant",
      content: "",
      toolCalls: [],
    };

    set((s) => ({
      messages: [...s.messages, userMsg, assistantMsg],
      isStreaming: true,
      error: null,
    }));

    const updateAssistant = (mutator: (m: ChatMessage) => ChatMessage) => {
      set((s) => ({
        messages: s.messages.map((m) => (m.id === assistantMsg.id ? mutator(m) : m)),
      }));
    };

    try {
      // Send the conversation so far WITHOUT the placeholder assistant.
      const history = get()
        .messages.filter((m) => m.id !== assistantMsg.id)
        .map((m) => ({ role: m.role, content: m.content }));

      await streamChat(history, {
        onText: (chunk) => {
          updateAssistant((m) => ({ ...m, content: m.content + chunk }));
        },
        onToolCall: (tc) => {
          updateAssistant((m) => ({
            ...m,
            toolCalls: [...m.toolCalls, { ...tc, status: "pending" }],
          }));
        },
        onToolResult: (id, ok, snippet) => {
          updateAssistant((m) => ({
            ...m,
            toolCalls: m.toolCalls.map((t) =>
              t.id === id ? { ...t, status: ok ? "ok" : "error", snippet } : t,
            ),
          }));
        },
        onError: (msg) => {
          set({ error: msg });
        },
      });
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ isStreaming: false });
    }
  },
}));
