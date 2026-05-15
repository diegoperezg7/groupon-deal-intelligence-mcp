import type { ChatMessage } from "../store/chat";
import { ToolBadge } from "./ToolBadge";
import { TypingDots } from "./TypingDots";

export function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  // Pick a "thinking" label that hints at what's happening:
  //   - tools are pending → model is reasoning over their result
  //   - no tools yet → model is deciding what to do
  let thinkingLabel: string | undefined;
  if (!isUser && !message.content) {
    const anyPending = message.toolCalls.some((t) => t.status === "pending");
    const anyDone = message.toolCalls.length > 0;
    if (anyPending) {
      thinkingLabel = "Running tools";
    } else if (anyDone) {
      thinkingLabel = "Composing answer";
    } else {
      thinkingLabel = "Thinking";
    }
  }

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
        {!isUser && !message.content && (
          <TypingDots label={thinkingLabel} />
        )}
      </div>
    </div>
  );
}

function renderText(text: string) {
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
