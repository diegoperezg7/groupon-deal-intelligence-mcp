# Next steps

If this project moved past take-home into something I'd own at Groupon, here's the order I'd build in.

## 1. Scheduled diff-only ingestion

Today the pipeline is a CLI script. A scheduled re-ingest that:

- Hits the listings on a cron.
- Computes a content hash per deal (`title + price + discount + description`).
- Only re-embeds rows whose hash changed (embeddings are the costly part).
- Marks deals not seen in the last N runs as `inactive` rather than deleting.
- Emits Prometheus-style metrics for ops.

This turns the prototype into a service with deterministic costs.

## 2. Pagination + sitemap-driven discovery

`/ofertas/{slug}` only renders 9 deals server-side. The other dozens are lazy-loaded. Two paths:

- Scroll-triggered fetching inside `StealthySession` — works but increases the anti-bot signal.
- Parse `/sitemap.xml`, which lists every deal URL by definition.

The sitemap path is cleaner and gives us total coverage. I'd do it second because pagination over real listings is more realistic for production multi-source ingest.

## 3. Multi-locale

The JSON-LD parser is locale-agnostic — Schema.org is the same on `.com`, `.de`, `.fr`, `.es`. The pieces that change are:

- Currency parsing (already a method, just needs the locale).
- Stop-words for copy-pattern extraction (currently Spanish-only).
- Category slug mapping (some categories have different names per locale).

A `LocalePack` interface plus per-locale config would let us scrape multiple Groupon properties with the same pipeline.

## 4. Streamable HTTP transport

Stdio works for Claude Desktop and the Inspector. Streamable HTTP is what every other production scenario wants — long-running services calling the MCP server. The `StreamableHTTPServerTransport` from the SDK plugs in next to the existing stdio handler. ~30 minutes of work; we have the seam.

## 5. A third interface: HTTP API

Mirror every CLI command and MCP tool as a REST endpoint at `/api/v1/...`. Same `core/` engine, third consumer surface. This is the proof that the platform thinking in the README is real: adding a new interface is a thin file, not a rewrite.

## 6. LLM-assisted copy improvement tool

A `suggest_better_title` tool that:

- Takes a deal id.
- Calls `analyze_market` to get the common-token patterns and top performers in the same segment.
- Asks an LLM (via the same `OPENAI_BASE_URL` abstraction) to propose 3 alternative titles that lean into the patterns.
- Returns them with a confidence score.

Merchant-facing, AI-native, defensible — and the kind of thing Nodegraph is supposed to enable for non-ML teams.

## 7. Merchant dashboard

A small Next.js front-end consuming the HTTP API from (5). Login-as-merchant, pick your category × location, see:

- Your deal's score vs the segment.
- The 5 nearest competitors with their scores.
- Copy patterns you're missing.
- Where else (other cities) the category is underserved.

This is `analyze_market` made visible. Same engine, no LLM in the loop — just the deterministic scoring + analytics already in `core/`.

## 8. Token-budget aware MCP responses

For very large segments (1000+ deals), today's `analyze_market` returns the full top-10 with full deal records. With more data, we'd add:

- A `max_response_tokens` argument (estimated from the JSON length).
- Truncation strategies (drop descriptions, drop bottom-half of top performers).
- Pagination on `category_insights.locations`.

The MCP spec doesn't standardise this yet — every server reinvents it. There's an opportunity here to ship a small library + a proposal.

## 9. Quality benchmarks

A regression-test battery of natural-language queries with expected top-3 results (curated manually). Run on every PR. Fail the build if recall@3 drops more than 10%. This is the kind of thing I built at BeAI for our internal RAG systems — a test harness that makes embedding-quality changes legible rather than vibes-based.

---

These are ordered roughly by ROI for a real product team. The first three move the prototype to a service; the next two prove the platform claim; the last four are product features that I think genuinely move the needle for Groupon or its merchants.
