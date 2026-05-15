import type { ChatMessage } from "../store/chat";
import { ToolBadge } from "./ToolBadge";

export function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`message message-${message.role}`}>
      <div className="message-bubble">
        {message.toolCalls.length > 0 && (
          <div className="message-toolcalls">
            {message.toolCalls.map((tc) => (
              <ToolBadge key={tc.id} call={tc} />
            ))}
          </div>
        )}
        {message.content && (
          <div className="message-text">{renderText(message.content)}</div>
        )}
        {!isUser && !message.content && message.toolCalls.length === 0 && (
          <div className="message-text muted">…</div>
        )}
      </div>
    </div>
  );
}

function renderText(text: string) {
  // Render markdown-lite: paragraph breaks + bold (**word**).
  return text.split(/\n\n+/).map((para, i) => (
    <p key={i}>{renderBold(para)}</p>
  ));
}

function renderBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
