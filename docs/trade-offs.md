# Trade-offs

What was sacrificed to ship in time, and what I'd do with more.

## Volume: 52 deals, not 500

Groupon's `/ofertas/{slug}` listings render ~9 deals server-side and lazy-load the rest via JS scroll. To go past ~9 per listing I'd need either:

- Scroll-triggered fetching inside `StealthySession` (more browser interactions, more anti-bot signal).
- The sitemap (`/sitemap.xml`) or an authenticated API.

Neither was worth more than ~30 minutes of polish for the take-home. At 14 listings × ~9 each + global dedup we landed at 52 unique deals across 7 cities and 8 categories — enough to give every tool real signal (the semantic search returns meaningful matches; the market analysis has price/discount/rating distributions to work with).

**What I'd do with more time**: write a `--paginate` option that scrolls each listing until N deals are gathered, with the same jitter discipline.

## Ingestion: one-shot, not scheduled

The pipeline is a CLI script. To productionise I'd:

- Wrap it in a cron / scheduled-task runner.
- Compute a content hash per deal and only re-embed when the hash changes.
- Mark deals not seen in the last N runs as `inactive` instead of deleting.
- Emit metrics (deals scraped, errors, duration) to a sink so a human can see the trend.

## Transport: stdio fully wired, HTTP stub

Streamable HTTP is the spec's recommendation for non-Desktop clients. I implemented stdio end-to-end (it's what Claude Desktop and the Inspector use) but the HTTP path throws a friendly error. Finishing it is a ~30-minute job — the `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk` slots in next to the existing stdio code.

**Why I cut it**: it would have shipped untested. I'd rather ship one transport that works than two that mostly do.

## Provider abstraction: OpenAI-compatible only

The abstraction supports OpenAI, OpenRouter, Azure OpenAI, and any drop-in gateway (they all speak the same `/v1/embeddings` shape). It does **not** support providers with bespoke shapes — Cohere, Voyage, Mistral's direct API — because those would need provider-specific code paths and I wasn't willing to introduce branching for a take-home.

Ollama is a separate provider (HTTP, but not OpenAI-shape) and is fully implemented.

## Vector storage: SQLite + 1536-d slot

The 1536-dim slot is chosen so OpenAI `text-embedding-3-small` fits natively. Smaller models (Ollama `nomic-embed-text` is 768d) get right-padded with zeros. This is a deliberate cost: ~3 MB of zero-padding per 500 deals in exchange for **no migration needed when swapping providers**.

If we committed to one provider in production I'd drop to the native dimension.

## Tests: 22 assertions, not 80

Coverage is highest where mistakes are most expensive:

- **Scoring** (12 assertions) — the only place arithmetic decisions live. Every component plus end-to-end ranking sanity.
- **Market analytics** (5 assertions) — price stats, discount bucketing, copy-pattern extraction.
- **MCP integration** (5 assertions) — list_tools, list_categories, list_locations, get_deal_details, compare_deals, all through the official `InMemoryTransport`.

What's missing: parser tests on real HTML fixtures (would require committing scraped pages, which I didn't want to do for IP reasons); CLI tests via `execa` (the CLI is glue, the hard work is in `core/` and that has tests); load tests on the semantic search (it's KNN over 52 rows; load isn't the concern at this stage).

## Adaptive selectors: disabled

Scrapling's "Smart Element Tracking" claims to handle minor DOM changes by similarity scoring. The documentation is light, there are zero published reliability numbers, and it's irrelevant for a one-shot pipeline. We rely on JSON-LD (stable contract with Google) and explicit selector cascades instead.

If I were running this in production with daily ingests, I'd revisit — but with a measurement plan, not on faith.

## English-only `instructions` field

The MCP server's `instructions` (what the LLM sees about what the server is for) is in English. The data is Spanish. The user can ask in either. I wrote `instructions` in English because tool-selection reasoning seems sharper in English in the models I've tested.

**Risk**: an LLM that's been asked in Spanish might miss a cue worded in English. I haven't seen this fail with Claude/GPT-4o-class models, but I'd test more carefully before going beyond Spanish.

## What stayed in scope

- All 8 tools fully implemented with Zod input AND output schemas.
- Both interfaces (MCP + CLI) sharing one core.
- A real catalogue (52 deals from real groupon.es), not synthetic.
- Provider abstraction.
- Docker for both ingest and serve.
- CI on every push.
- A doctor command that catches every misconfiguration before the user notices.
