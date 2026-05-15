import { useEffect, useState } from "react";
import { Moon, Sun, RefreshCw } from "lucide-react";
import { useChatStore } from "../store/chat";

export function Header() {
  const [dark, setDark] = useState<boolean>(() =>
    document.documentElement.classList.contains("dark-mode"),
  );
  const reset = useChatStore((s) => s.reset);
  const hasMessages = useChatStore((s) => s.messages.length > 0);

  useEffect(() => {
    document.documentElement.classList.toggle("dark-mode", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <header className="app-header">
      <div className="brand">
        <img src="/groupon-logo.svg" alt="" className="brand-logo" />
        <div className="brand-text">
          <span className="brand-title">Groupon Deal Intelligence</span>
          <span className="brand-sub">demo client · MCP server in the loop</span>
        </div>
      </div>
      <div className="header-actions">
        <button
          type="button"
          className="icon-btn"
          aria-label="Reset conversation"
          onClick={() => reset()}
          disabled={!hasMessages}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          onClick={() => setDark((d) => !d)}
        >
          {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}
