import { useState, type KeyboardEvent } from "react";
import { SendHorizontal } from "lucide-react";
import { useChatStore } from "../store/chat";

export function Composer() {
  const [text, setText] = useState("");
  const send = useChatStore((s) => s.send);
  const isStreaming = useChatStore((s) => s.isStreaming);

  const submit = async () => {
    const payload = text.trim();
    if (!payload || isStreaming) return;
    setText("");
    await send(payload);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <textarea
        className="composer-textarea"
        placeholder={
          isStreaming
            ? "Thinking…"
            : "Ask about deals, ofertas, descuentos, merchants… (Enter to send)"
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        disabled={isStreaming}
        autoFocus
      />
      <button
        type="submit"
        className="composer-send"
        disabled={!text.trim() || isStreaming}
        aria-label="Send"
      >
        <SendHorizontal size={18} aria-hidden="true" />
      </button>
    </form>
  );
}
