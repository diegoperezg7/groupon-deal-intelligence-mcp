import { useEffect } from "react";
import { Header } from "./components/Header";
import { ChatWindow } from "./components/ChatWindow";
import { Composer } from "./components/Composer";
import { useChatStore } from "./store/chat";

export function App() {
  // Restore the user's dark/light preference on mount.
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    const dark = stored === "dark" || (stored === null && prefersDark);
    document.documentElement.classList.toggle("dark-mode", !!dark);
  }, []);

  const error = useChatStore((s) => s.error);

  return (
    <div className="app-shell">
      <Header />
      <main className="app-main">
        <ChatWindow />
      </main>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <Composer />
    </div>
  );
}
