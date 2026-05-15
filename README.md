# groupon-deal-intelligence-mcp

An **MCP server** (+ companion CLI) that exposes deal-intelligence over **groupon.es** to any MCP-compatible client — semantic search, similarity, merchant-side market analytics, and category insights, all over a shared TypeScript core fed by a Scrapling-based Python ingestion pipeline.

> Status: **work in progress** — this README will be replaced with the full selling document at PHASE 7. See `/Users/diego/.claude/plans/hashed-cooking-fern.md` for the build plan.

## Quick links

- **GitHub**: https://github.com/diegoperezg7/groupon-deal-intelligence-mcp
- **License**: MIT
- **Stack**: TypeScript (runtime: MCP server + CLI), Python (ingestion via [Scrapling](https://github.com/D4Vinci/Scrapling))

## Architecture

```
groupon.es  ──[Scrapling]──▶  Python ingestion  ──▶  SQLite + sqlite-vec
                                                              │
                                                              ▼
                                          ┌────────────────────────────┐
                                          │   src/core/  (TypeScript)  │
                                          │   intelligence layer       │
                                          └────┬─────────────────┬─────┘
                                               │                 │
                                  ┌────────────▼─────┐  ┌────────▼────────┐
                                  │   src/mcp/       │  │   src/cli/      │
                                  │   MCP server     │  │   groupon-intel │
                                  └──────────────────┘  └─────────────────┘
```

**Design principle**: `core/` is interface-agnostic. The MCP server and CLI are thin wrappers over the same intelligence engine, so adding a future HTTP interface is a one-day job.

## Status checklist

See [`docs/STATUS.md`](docs/STATUS.md) (will be created) or follow commits.

---

*Built as part of the Groupon Foundry Challenge (May 2026).*
