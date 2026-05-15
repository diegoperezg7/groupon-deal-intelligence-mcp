# Architecture

A longer take on the decisions in [`README.md`](../README.md).

## Why a hybrid Python + TypeScript stack

| Decision driver                                                                                                          | What pulls Python                  | What pulls TypeScript        |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------- |
| Cloudflare on `groupon.es` needs a stealth browser stack (Patchright + Camoufox + TLS fingerprint spoofing).             | Scrapling (Python-only) is the cleanest one-library answer. | — |
| The MCP TypeScript SDK is the most mature today; Claude Desktop, Cursor, the official Inspector all align around stdio + Streamable HTTP. | — | `@modelcontextprotocol/sdk` 1.29.x |
| The role JD asks for "deep expertise in TypeScript, Node.js, Express, React, Next.js, and PostgreSQL".                   | — | Runtime should be TypeScript |

So: **Python for ingestion, TypeScript for runtime**. The seam is a SQLite file. The two halves never share a process — there's no FFI, no inter-language RPC, no shared dependency tree to keep in sync.

## Why a one-shot ingestion, not request-time scraping

A request-time scraper would have been a single TypeScript codebase. Tempting. The reasons against:

- **Demo robustness**. If the reviewer clones the repo on a day Groupon changes their HTML, a request-time scraper breaks immediately. A one-shot pipeline with a committed sample dataset doesn't.
- **Latency.** Each scrape is ~30–60s (Cloudflare challenge + JS rendering). That's a hard no for a tool an agent is going to call interactively.
- **Cost.** Each scrape burns ~5–10s of Camoufox runtime. Pre-ingestion is free at query time.
- **Honesty.** The project is "deal intelligence over a snapshot of groupon.es" — admitting that in the architecture is more useful than pretending it's real-time.

The downside is that the data ages. The `next-steps.md` doc has the production answer: scheduled diff-only re-ingest.

## Why SQLite + sqlite-vec

| Option                         | Pros                                                                       | Cons                                                              | Decision  |
| ------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------- |
| Postgres + pgvector            | The "real" production stack.                                                | An extra service to install/run. Overkill for 500 rows.            | Skip.     |
| **SQLite + sqlite-vec**        | Zero infra. File-based. Demo-friendly. KNN works.                          | Caps out around 1–10M rows.                                       | **This.** |
| JSON in-memory + cosine in TS  | Zero deps.                                                                  | No SQL, no filters, hand-rolled vector search.                     | Skip.     |
| Specialised vector DB (Qdrant) | Best perf at scale.                                                         | More infra to set up than the rest of the project combined.       | Skip.     |

The 1536-dim slot is chosen so we can swap the embeddings provider without a migration. We right-pad smaller vectors with zeros — wasteful per-row but cheap globally.

## Why shared `core/`

```
src/core/  ← interface-agnostic intelligence
  ↑
  └── src/mcp/  ← MCP server
  └── src/cli/  ← CLI
  └── (future) src/http/  ← HTTP API mirror
```

The rule the lint config enforces: `core/` imports **nothing** from `mcp/` or `cli/`. Only the reverse.

That separation is what makes "MCP + CLI" honest rather than two parallel projects pretending to share a name. Adding a third interface is a thin file, not a rewrite.

It's also the conceptual mirror of how an internal AI platform like Nodegraph should expose its primitives: one capability, many surfaces.

## Anti-stdout discipline

MCP servers over stdio communicate JSON-RPC on stdout. **Any non-JSON-RPC byte kills the connection.** The most common way junior implementations break is a stray `console.log("debug")`.

We enforce no-stdout twice:

1. The `pino` logger is initialised with `pino.destination(2)` — stderr only. Always.
2. ESLint has `no-console: error` scoped to `src/mcp/**`. The build fails before the bug ships.

This is the kind of failure mode that's invisible in unit tests and obvious to anyone who's run an MCP server in production. Worth two lines of config.

## Provider abstraction over OpenAI-compatible

The embeddings layer takes an `OPENAI_BASE_URL` env var. Set it to:

- `https://api.openai.com/v1` (default) — OpenAI directly.
- `https://openrouter.ai/api/v1` — OpenRouter. One key, many providers, embeddings + chat completions in the same SDK.
- An Azure OpenAI deployment URL.
- Anything else that speaks the OpenAI Embeddings API shape.

The same TypeScript code, the same Python `openai` client, no provider-specific branches. We also have a parallel Ollama provider for fully offline use.

## Streamable HTTP transport

The MCP spec deprecated SSE (Server-Sent Events) in favour of Streamable HTTP in March 2025. Stdio + Streamable HTTP is the future-proof pair. **Both are wired in this project.**

- Default: `MCP_TRANSPORT=stdio` (used by Claude Desktop, the Inspector, most clients).
- Set `MCP_TRANSPORT=http` and `MCP_HTTP_PORT=3333` (default) to serve the same tool surface over Streamable HTTP at `POST/GET /mcp`. Stateless mode — no sessions, no in-memory message log.

`curl` smoke test (the kind of thing you can drop in a runbook):

```bash
MCP_TRANSPORT=http node dist/mcp/server.js &
curl -sS -X POST http://localhost:3333/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",
       "params":{"protocolVersion":"2025-03-26","capabilities":{},
                 "clientInfo":{"name":"curl","version":"0"}}}'
```
