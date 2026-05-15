import { useEffect, useRef } from "react";
import { useChatStore } from "../store/chat";
import { Message } from "./Message";
import { ExamplePrompts } from "./ExamplePrompts";

export function ChatWindow() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="chat-empty">
        <div className="chat-empty-hero">
          <img src="/groupon-logo.svg" alt="" className="chat-empty-logo" />
          <div className="chat-empty-copy">
            <span className="chat-empty-eyebrow">MCP server in the loop</span>
            <h2>Ask anything about deals on groupon.es</h2>
          </div>
        </div>
        <p className="chat-empty-sub">
          This chat talks to the MCP server in the same repo. The model picks
          the right tool, the tool returns structured data, the model wraps it
          for you. Try one:
        </p>
        <ExamplePrompts />
      </div>
    );
  }

  return (
    <div className="chat-window">
      <div className="chat-messages">
        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
