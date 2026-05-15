# Trade-offs

What was sacrificed to ship in time, and what I'd do with more.

## Volume: 77 deals, not 5 000

The discovery pipeline combines two sources:

1. **14 `/ofertas/{slug}` listings** (Madrid, Barcelona, Valencia, Sevilla, Bilbao, Malaga, Zaragoza × belleza, gastronomia, cosas-que-hacer, escapadas, bienestar, cursos, regalos, electronica). Each renders ~9 deals SSR, the rest lazy-loaded via JS.
2. **Sitemap-driven sampling** (`--sitemap N`) — walks `/sitemap.xml`, follows the gzip child sitemaps, and pools deal URLs that the listings never surface. This is how we get past the SSR cap.

Final dataset: **77 unique deals across 11 Spanish cities and 8 categories**, 75 distinct merchants. 100% have a price, 53% have an explicit discount tag, 71% have a customer rating, 100% have a description and a merchant. Enough signal that every tool returns interesting answers — `analyze_market` reports a real price distribution, `compare_deals` ranks with non-zero scores.

**What I'd do with more time**: scroll-triggered pagination on each listing for deeper city-and-category sampling, then a scheduled diff-only re-ingest so the catalogue doesn't age.

## Ingestion: one-shot, not scheduled

The pipeline is a CLI script. To productionise I'd:

- Wrap it in a cron / scheduled-task runner.
- Compute a content hash per deal and only re-embed when the hash changes.
- Mark deals not seen in the last N runs as `inactive` instead of deleting.
- Emit metrics (deals scraped, errors, duration) to a sink so a human can see the trend.

## Transport: both stdio and Streamable HTTP wired

Both transports work. `MCP_TRANSPORT=stdio` is the default and what Claude Desktop / the Inspector use; `MCP_TRANSPORT=http` brings up a stateless Streamable HTTP listener at `/mcp` on the configured port (3333 by default).

Why both? Stdio is the right answer for desktop-style clients. Streamable HTTP is what any production-style integration (long-running service, Kubernetes pod, load balancer) is going to want — and it's the transport that replaced SSE in the 2025-03-26 spec. Implementing it now keeps the seam honest.

## Provider abstraction: OpenAI-compatible only

The abstraction supports OpenAI, OpenRouter, Azure OpenAI, and any drop-in gateway (they all speak the same `/v1/embeddings` shape). It does **not** support providers with bespoke shapes — Cohere, Voyage, Mistral's direct API — because those would need provider-specific code paths and I wasn't willing to introduce branching for a take-home.

Ollama is a separate provider (HTTP, but not OpenAI-shape) and is fully implemented.

## Vector storage: SQLite + 1536-d slot

The 1536-dim slot is chosen so OpenAI `text-embedding-3-small` fits natively. Smaller models (Ollama `nomic-embed-text` is 768d) get right-padded with zeros. This is a deliberate cost: ~3 MB of zero-padding per 500 deals in exchange for **no migration needed when swapping providers**.

If we committed to one provider in production I'd drop to the native dimension.

## Tests: 36 assertions, not 80

Coverage is highest where mistakes are most expensive:

- **Scoring** (12 assertions) — the only place arithmetic decisions live. Every component plus end-to-end ranking sanity.
- **Market analytics** (5 assertions) — price stats, discount bucketing, copy-pattern extraction.
- **MCP integration** (19 assertions) — all 10 tools, 3 resource templates, 3 prompts and the readOnlyHint annotation contract, all through the official `InMemoryTransport`.

What's missing: parser tests on real HTML fixtures (would require committing scraped pages, which I didn't want to do for IP reasons); CLI tests via `execa` (the CLI is glue, the hard work is in `core/` and that has tests); load tests on the semantic search (it's KNN over 52 rows; load isn't the concern at this stage).

## Adaptive selectors: disabled

Scrapling's "Smart Element Tracking" claims to handle minor DOM changes by similarity scoring. The documentation is light, there are zero published reliability numbers, and it's irrelevant for a one-shot pipeline. We rely on JSON-LD (stable contract with Google) and explicit selector cascades instead.

If I were running this in production with daily ingests, I'd revisit — but with a measurement plan, not on faith.

## English-only `instructions` field

The MCP server's `instructions` (what the LLM sees about what the server is for) is in English. The data is Spanish. The user can ask in either. I wrote `instructions` in English because tool-selection reasoning seems sharper in English in the models I've tested.

**Risk**: an LLM that's been asked in Spanish might miss a cue worded in English. I haven't seen this fail with Claude/GPT-4o-class models, but I'd test more carefully before going beyond Spanish.

## What stayed in scope

- All 10 tools fully implemented with Zod input AND output schemas.
- Both interfaces (MCP + CLI) sharing one core.
- A real catalogue (52 deals from real groupon.es), not synthetic.
- Provider abstraction.
- Docker for both ingest and serve.
- A doctor command that catches every misconfiguration before the user notices.
