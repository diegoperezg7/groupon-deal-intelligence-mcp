# groupon-deal-intelligence-web

> **This is a demo client of the MCP server in [`../`](../). The MCP server is the deliverable; this is one way to see it in action.**

A small web chat that talks to the existing MCP server over Streamable HTTP, with **xAI Grok** as the default LLM. Same `core/` engine as the CLI and the MCP itself — same data, same tools, third surface.

```
┌─────────────────────────────┐    POST /chat (SSE)    ┌──────────────────────────────┐
│   src/  (Vite + React 19)   │ ◄────────────────────► │  server/  (Express BFF)      │
│   chat UI + ToolBadges      │                        │   xAI Grok + MCP client      │
└─────────────────────────────┘                        └──────────────┬───────────────┘
                                                                       │ Streamable HTTP
                                                                       │ POST/GET /mcp
                                                                       ▼
                                                       ┌──────────────────────────────┐
                                                       │  MCP server in ../           │
                                                       │  (unchanged, 8 tools)        │
                                                       └──────────────────────────────┘
```

The BFF never imports `core/` directly. It speaks MCP over HTTP — the round-trip is the proof that the parent project's "third interface" claim is real.

## Prerequisites

- Node ≥ 22.
- The MCP server in `../` running over Streamable HTTP. From the repo root:
  ```bash
  npm run build
  MCP_TRANSPORT=http node dist/mcp/server.js
  ```
- An LLM key. Default is **xAI Grok** via `https://api.x.ai/v1`. To use OpenAI or OpenRouter, just swap `LLM_BASE_URL`/`LLM_MODEL` in the repo-root `.env`.

## Quick start (development)

```bash
cd web
npm install
# repo-root .env should set LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, MCP_URL
npm run dev
```

That brings up:
- The BFF on `http://localhost:3000` (`/healthz`, `/chat`, `/api/tools`, `/api/deals/:id`).
- The Vite dev server on `http://localhost:5173` with proxying to the BFF.

Open `http://localhost:5173`. Try the example prompts on the empty state.

## Production build

```bash
npm run build       # tsc + vite build into dist/
node dist/server/index.js
# Express serves the static frontend AND the BFF on the same port (3000).
```

## Docker

The repo-root `docker-compose.yml` ships a `web` service:

```bash
# from the repo root
docker compose up --build ingest mcp web
# then open http://localhost:3000
```

The `web` service depends on `mcp` (which depends on `ingest`). Set `LLM_API_KEY` in the repo-root `.env` first.

## Tests

```bash
npm test            # vitest (server + frontend)
npm run typecheck   # tsc on both tsconfig.json (frontend) and tsconfig.server.json
npm run lint        # eslint flat config
```

Current coverage: 6 BFF assertions (MCP tool → OpenAI function spec mapping, system prompt), 7 SSE parser assertions, 5 Zustand store assertions. Mocks the OpenAI and MCP clients — fully offline.

## Layout

```
web/
├── server/                BFF (Express + MCP client + LLM loop)
│   ├── index.ts           boots Express, connects MCP, registers routes
│   ├── chat.ts            POST /chat (SSE streaming with tool loop)
│   ├── mcp-client.ts      long-lived StreamableHTTPClientTransport singleton
│   ├── llm.ts             OpenAI-compat client (xAI default)
│   ├── tools.ts           MCP inputSchema → OpenAI function spec
│   ├── deals.ts           thin proxies: /api/deals/:id, /api/tools
│   ├── config.ts          env-var schema (zod)
│   ├── logger.ts          pino → stderr
│   └── types.ts           wire types shared with the frontend
├── src/                   Frontend (Vite + React 19 + Zustand)
│   ├── api/chat.ts        fetch + SSE parsing
│   ├── components/        Header, ChatWindow, Message, ToolBadge, Composer…
│   ├── lib/parseSSE.ts    incremental SSE event parser
│   ├── store/chat.ts      Zustand: messages, tool calls, isStreaming
│   └── styles/            theme.css (Groupon palette) + globals.css
├── tests/                 vitest server + frontend
├── Dockerfile             multi-stage build
└── vite.config.ts
```

## Design notes

- **One long-lived MCP client per BFF process**. The SDK reconnects automatically on transient disconnects (max 2 retries by default). No per-request connect overhead.
- **xAI Grok tool-call streaming arrives as a single chunk**, not as argument deltas (unlike OpenAI direct). The UI just shows a "calling tool…" badge until the call returns; we never need to render partial args.
- **No persistence**. Refreshing the page wipes the conversation. This is a demo, not a product.
- **System prompt is short and anchored**. It tells the model the scope (Spanish marketplace, EUR, snapshot data), names the tools available, and instructs it to invoke them rather than hallucinate.
- **Branding is Groupon-inspired, not cloned**. Green `#53A318`, Inter font, dark/light toggle. The logo is the SimpleIcons SVG (also used in the parent README).

## Why this exists

The brief asked for an MCP server. The parent README already justifies why we shipped an MCP server **and** a CLI — *"the interface depends on the consumer"*. This web client is the third interface that makes that promise concrete: a real LLM-powered chat, talking to the real MCP server, over the real Streamable HTTP transport.

If you want to skip the chat and inspect the MCP server directly, point Claude Desktop at the snippet in `../scripts/claude-desktop-config.json`, or use `npx -y @modelcontextprotocol/inspector node ../dist/mcp/server.js`.
