/**
 * "Thinking…" indicator shown in the assistant bubble while we wait for
 * the first text chunk to arrive. Three dots with a staggered bounce.
 *
 * The label (optional) shifts depending on whether the LLM is still
 * deciding which tool to call vs producing the final answer.
 */
export function TypingDots({ label }: { label?: string }) {
  return (
    <div className="typing" role="status" aria-live="polite">
      <span className="typing-label">{label ?? "Thinking"}</span>
      <span className="typing-dots" aria-hidden="true">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </span>
    </div>
  );
}
