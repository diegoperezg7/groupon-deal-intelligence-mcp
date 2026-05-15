import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import type { ToolCallSummary } from "../store/chat";

export function ToolBadge({ call }: { call: ToolCallSummary }) {
  const icon =
    call.status === "pending" ? (
      <Loader2 size={14} aria-hidden="true" className="spin" />
    ) : call.status === "ok" ? (
      <CheckCircle2 size={14} aria-hidden="true" />
    ) : (
      <XCircle size={14} aria-hidden="true" />
    );
  return (
    <div className={`tool-badge tool-${call.status}`} title={call.arguments}>
      {icon}
      <code>{call.name}</code>
      {call.snippet && <span className="tool-snippet">{call.snippet.slice(0, 90)}…</span>}
    </div>
  );
}
