<div align="center">

<img src="docs/assets/groupon-logo.svg" alt="Groupon" width="120" />

# Groupon Deal Intelligence MCP

**An MCP server (and companion CLI) that turns groupon.es into a queryable, semantically-searchable, merchant-analytics-ready data layer for any MCP client.**

[![Node](https://img.shields.io/badge/node-%E2%89%A522-43853d?logo=node.js&logoColor=white)](.nvmrc)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](tsconfig.json)
[![Python](https://img.shields.io/badge/Python-%E2%89%A53.10-3776AB?logo=python&logoColor=white)](ingestion/pyproject.toml)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-1.29-9F00FF)](https://github.com/modelcontextprotocol/typescript-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

> Submitted as the Foundry Challenge for the **AI Fullstack Engineer — Nodegraph** role at Groupon. The brief asked for an MCP server that any MCP client can connect to and use to answer questions about groupon.es deals — built to demonstrate engineering taste, AI tooling fluency and product thinking in a deliberately under-specified problem.

---

## TL;DR

```bash
git clone https://github.com/diegoperezg7/groupon-deal-intelligence-mcp
cd groupon-deal-intelligence-mcp

# 1. Install (Node + Python)
npm install && npm run build
cd ingestion && uv venv && source .venv/bin/activate && uv pip install -e .
python -m camoufox fetch                                # one-time browser pull
cd ..

# 2. Configure (one key works for embeddings via OpenRouter or OpenAI)
cp .env.example .env && $EDITOR .env

# 3. Populate the catalogue — use the committed sample…
python -m groupon_ingest embed data/sample-deals.json --sqlite data/deals.sqlite
#    …or run a fresh scrape (~15 min for ~150 deals):
# python -m groupon_ingest scrape --kinds all --slugs all --max 12 --sitemap 120 \
#     --output data/scraped.json
# python -m groupon_ingest embed data/scraped.json --sqlite data/deals.sqlite

# 4. Verify everything works end-to-end
node dist/cli/index.js doctor                           # short health check
bash scripts/demo.sh                                    # 7-step guided demo

# 5. Plug the MCP server into Claude Desktop (or any MCP client)
#    See scripts/claude-desktop-config.json for the snippet.
```

> Want to install the CLI globally as `groupon-intel`? `npm link` from the repo
> root. Want HTTP transport instead of stdio? `MCP_TRANSPORT=http node dist/mcp/server.js`.

---

## What this does

You point an MCP-compatible client at this server (Claude Desktop, Claude Code, Cursor, the MCP Inspector, anything) and it can now answer questions like:

- *"Find me the best wellness deals in Madrid under €50."*
- *"What's the median price for beauty offers in Barcelona right now? Show me the top 5 by attractiveness."*
- *"I run a spa in Madrid charging €60. How does my pricing compare to the segment?"*
- *"Which Spanish cities have the most underserved beauty market relative to wellness?"*
- *"Compare these three deals for an anniversary dinner — which one wins?"*

…all in **structured tool output** the LLM can reason over directly, not blobs of HTML it has to parse.

---

## Three interfaces over the same core

> _The deliverable is the MCP server. The CLI and the web chat are two more consumers of the same `core/` engine — proof that **the interface depends on the consumer**, not the other way around._

| Interface | Where it lives | Who consumes it | Why it's here |
|---|---|---|---|
| **MCP server** *(primary deliverable)* | [`src/mcp/`](src/mcp) — stdio + Streamable HTTP | Claude Desktop, Cursor, the MCP Inspector, any MCP client | What the brief asked for. 10 tools, 3 resources, 3 prompts. |
| **CLI companion** | [`src/cli/`](src/cli) — `groupon-intel` | Engineers, CI pipelines, terminals | Token-cost-free way to drive the same intelligence. 12 commands, easy to script and assert on. |
| **Web chat demo** | [`web/`](web) — Vite + React + Express BFF + xAI Grok | Humans, demo audiences | Closes the loop: an LLM in a browser invoking the MCP server's tools in real time. |

All three share **the same `core/` engine**. The MCP server is exposed today over **stdio** *and* over **Streamable HTTP** (the spec's successor to SSE). The web demo's BFF talks to that HTTP transport — it does **not** import `core/` directly, so the round-trip is the proof that the third interface is real and not just a renamed CLI.

Why this matters for a Nodegraph-style platform: the same capability has to be reachable from agents, engineers, services and end-users without rewriting the intelligence each time. This repo is the smallest faithful illustration of that pattern.

---

## Architecture

```mermaid
flowchart LR
    subgraph Sources
        G(("groupon.es"))
    end

    subgraph Ingestion["Python ingestion (Scrapling)"]
        direction TB
        Scrape["Scrape<br/>StealthySession +<br/>solve_cloudflare"] --> Parse["Parse<br/>JSON-LD primary +<br/>data-testid fallback"]
        Parse --> Norm["Normalize<br/>pydantic + dedupe"]
        Norm --> Embed["Embed<br/>OpenAI-compatible API"]
    end

    G -->|HTTPS| Scrape
    Embed --> Store[("SQLite +<br/>sqlite-vec")]

    subgraph Runtime["TypeScript runtime"]
        direction TB
        Core["core/<br/>interface-agnostic intelligence"]
        MCP["mcp/<br/>10 tools + 3 resources + 3 prompts<br/>stdio + Streamable HTTP"]
        CLI["cli/<br/>12 commands · 3 formats"]
        Core --> MCP
        Core --> CLI
    end

    Store --> Core

    subgraph WebDemo["web/ (demo client)"]
        direction TB
        BFF["Express BFF<br/>tool loop + SSE"]
        UI["Vite + React<br/>chat UI"]
        UI <-->|"POST /chat (SSE)"| BFF
        BFF -->|"OpenAI-compat"| xAI{{"xAI Grok"}}
    end

    subgraph Clients["Other MCP clients"]
        Claude["Claude Desktop"]
        Cursor["Cursor"]
        Inspector["MCP Inspector"]
        Engineer["Engineer / CI"]
    end

    BFF -.HTTP JSON-RPC.- MCP
    MCP -.stdio | HTTP.- Claude
    MCP -.stdio.- Cursor
    MCP -.HTTP.- Inspector
    CLI --- Engineer

    classDef ext fill:#f5f3ff,stroke:#9F00FF,color:#1f1f1f
    classDef core fill:#dcfce7,stroke:#16a34a,color:#1f1f1f
    classDef store fill:#fef3c7,stroke:#d97706,color:#1f1f1f
    classDef demo fill:#ffe8d9,stroke:#e6651b,color:#1f1f1f
    class G,Claude,Cursor,Inspector,Engineer,xAI ext
    class Core,MCP,CLI core
    class Store store
    class BFF,UI demo
```

**The golden rule**: `core/` imports nothing from `mcp/` or `cli/` — only the reverse. That separation is what lets us add a third interface (HTTP, gRPC, anything) without disturbing the intelligence.

### Why a hybrid Python + TypeScript stack?

```mermaid
flowchart LR
    A["Scrapling\nis Python-only"] --> B{"Best tool\nfor each layer"}
    C["MCP TS SDK\nis the spec's reference"] --> B
    D["Cloudflare bypass\nneeds Camoufox + Patchright"] --> B
    B --> E["Python = ingestion (one-shot)<br/>TypeScript = runtime (always-on)"]
    E --> F["SQLite is the seam<br/>between the two worlds"]
    classDef good fill:#dcfce7,stroke:#16a34a
    classDef neutral fill:#f5f3ff,stroke:#9F00FF
    class A,C,D neutral
    class B,E,F good
```

---

## Quick start

### Prerequisites

- **Node** ≥ 22 (see `.nvmrc`)
- **Python** ≥ 3.10 (`uv` recommended, plain `pip` works too)
- One of:
  - An **OpenAI API key** (or any [OpenAI-compatible endpoint](#using-openrouter-or-another-openai-compatible-provider) like OpenRouter)
  - **Ollama** running locally with `nomic-embed-text` pulled

### 1. Install

```bash
git clone https://github.com/diegoperezg7/groupon-deal-intelligence-mcp
cd groupon-deal-intelligence-mcp

# TypeScript side
npm install
npm run build

# Python side
cd ingestion
uv venv && source .venv/bin/activate
uv pip install -e .
python -m camoufox fetch          # one-time: downloads the stealth browser
cd ..
```

### 2. Configure

```bash
cp .env.example .env
# edit .env to set OPENAI_API_KEY (or switch EMBEDDINGS_PROVIDER=ollama)
```

### 3. Populate the catalogue

Two options:

```bash
# Option A — fastest: use the committed sample
# (77 real deals scraped on 2026-05-15 from groupon.es)
python -m groupon_ingest embed data/sample-deals.json --sqlite data/deals.sqlite

# Option B — fresh scrape (~25 min for ~80 deals; needs Camoufox installed)
groupon-intel ingest --max 12 --sitemap 120
```

See [`ingestion/README.md`](ingestion/README.md) for the full pipeline:
listing + sitemap discovery, the JSON-LD-first parser cascade, the
`scrape` / `embed` / `ingest` / `doctor` commands and their flags.

### 4. Verify the install

```bash
groupon-intel doctor
```

Expected output:

```
groupon-intel doctor
  ✓ config loaded (provider=openai)
  ✓ SQLite at /.../data/deals.sqlite
  ✓ schema version 1
  ✓ 77 deals in catalogue
  ✓ 8 categories
  ✓ 11 locations
  ✓ embeddings provider responded (dim=1536)
  ✓ semantic search works — top hit: '1 o 3 sesiones de masaje…' (sim=0.562)

All green. The MCP server is ready to serve.
```

### 5. Connect Claude Desktop

Copy the snippet from [`scripts/claude-desktop-config.json`](scripts/claude-desktop-config.json) into your Claude Desktop config (substituting absolute paths), then restart Claude Desktop. The server appears as **groupon-es-deal-intelligence** with 10 tools, 3 resources and 3 slash-command prompts.

---

## MCP surface

```mermaid
flowchart TB
    subgraph Tools
        T1[search_deals]
        T2[get_deal_details]
        T3[find_similar_deals]
        T4[compare_deals]
        T5[analyze_market]
        T6[category_insights]
        T7[list_categories]
        T8[list_locations]
        T9[list_merchants]
        T10[get_catalog_overview]
    end
    subgraph Resources
        R1["groupon://deal/{id}"]
        R2["groupon://category/{slug}"]
        R3["groupon://location/{slug}"]
    end
    subgraph Prompts["Slash-command prompts"]
        P1[analyze_my_pricing]
        P2[find_arbitrage]
        P3[compare_deals]
    end
    classDef tool fill:#dcfce7,stroke:#16a34a
    classDef res fill:#fef3c7,stroke:#d97706
    classDef prom fill:#f5f3ff,stroke:#9F00FF
    class T1,T2,T3,T4,T5,T6,T7,T8,T9,T10 tool
    class R1,R2,R3 res
    class P1,P2,P3 prom
```

### Tools

| Tool                  | Purpose                                                                                                          | Annotations                                |
|-----------------------|------------------------------------------------------------------------------------------------------------------|--------------------------------------------|
| `search_deals`        | Semantic + filtered search (query, location, category, **merchant**, max price, min rating).                      | readOnly, idempotent                       |
| `get_deal_details`    | Full normalised record for a deal by id or URL, plus its merchant.                                                | readOnly, idempotent                       |
| `find_similar_deals`  | Embedding-based KNN over a reference deal's own vector (no re-embedding round-trip).                              | readOnly, idempotent                       |
| `compare_deals`       | Score and rank 2–10 deals side-by-side with a deterministic attractiveness score (discount, rating, popularity, price). | readOnly, idempotent                       |
| `analyze_market`      | Merchant-side intel for a (category, location) pair: price stats, discount distribution, top performers, underserved nearby locations, copy patterns. | readOnly, idempotent                       |
| `category_insights`   | Cross-location breakdown for one category.                                                                       | readOnly, idempotent                       |
| `list_categories`     | Discovery: every category + deal count.                                                                          | readOnly                                   |
| `list_locations`      | Discovery: every location + deal count.                                                                          | readOnly                                   |
| `list_merchants`      | Discovery: merchants in the catalogue with deal count and rating. Sort by `dealCount` / `rating` / `name`.       | readOnly, idempotent                       |
| `get_catalog_overview`| One-shot bootstrap snapshot: totals, price/discount distribution, top categories/locations/merchants, freshness. | readOnly, idempotent                       |

Every tool declares **both** a Zod input schema and output schema, and returns `structuredContent` so MCP-aware clients render typed data (not stringified JSON).

### Resources

URI template resources let an MCP client list and read entities directly, no tool call required.

- `groupon://deal/{id}` — the canonical view of one deal.
- `groupon://category/{slug}` — the 20 most attractive deals in a category.
- `groupon://location/{slug}` — the 20 most attractive deals in a city.

### Prompts

Prompts surface as **slash-commands** in compatible clients (e.g. `/analyze_my_pricing` in Claude Desktop). They pre-bind arguments and write a tight opening user message so the agent goes straight to invoking the right tools.

- `analyze_my_pricing` — merchant: "I sell X in Y at price Z, where do I fit?"
- `find_arbitrage` — analyst: surface high-quality deals in thin segments.
- `compare_deals` — shopper: rank a hand-picked set with reasoning.

---

## CLI surface

```bash
$ groupon-intel --help

groupon-intel  CLI companion to the groupon-deal-intelligence MCP server.

Commands:
  search [query...]      semantic search (filters: -l, -c, -m, --max-price, --min-rating)
  deal <id-or-url>       show one deal
  similar <id-or-url>    KNN over a reference deal's embedding
  compare <ids...>       rank 2–10 deals
  analyze                merchant-side analytics (-c category -l location)
  category <slug>        cross-location insights for a category
  categories             list every category in the catalogue
  locations              list every location in the catalogue
  merchants              list merchants with deal count and rating
  overview               one-shot catalogue snapshot (totals + top buckets)
  ingest                 run the Python pipeline end-to-end
  doctor                 health check (config, store, embeddings, search)
```

Switch output with `-f json|table|markdown`. Defaults to **table** on a TTY, **json** when piped — so it works equally well at a terminal and in CI.

### Demo

```bash
$ groupon-intel search "masaje relajante para parejas" --limit 3
┌──────────────────────────────────┬────────────────────────────────────────────────────┬──────────┬─────────┬───┬───┬───┬───────┐
│ ID                               │ Title                                              │ City     │ Cat     │ € │ % │ ★ │   sim │
├──────────────────────────────────┼────────────────────────────────────────────────────┼──────────┼─────────┼───┼───┼───┼───────┤
│ masajes-bermejales-2             │ Masaje en pareja de 45 o 90 minutos o ritual Rela… │ sevilla  │ belleza │ — │ — │ — │ 0.555 │
│ sense-natur-massage-masaje-en-p… │ Masaje en pareja de hasta 90 minutos con bebida y… │ valencia │ belleza │ — │ — │ — │ 0.541 │
│ dm-by-bodywood-7                 │ Masaje a elegir entre relajante, descontracturant… │ malaga   │ belleza │ — │ — │ — │ 0.534 │
└──────────────────────────────────┴────────────────────────────────────────────────────┴──────────┴─────────┴───┴───┴───┴───────┘
```

---

## Web chat demo (`web/`)

The third interface — a browser chat that proves the MCP server is reachable from a real LLM-driven client, not just from another piece of TypeScript we wrote.

- Vite + React 19 frontend with a Groupon-inspired palette (verde primary, coral secondary, sun tertiary), dark/light toggle, animated thinking indicator with stage-aware label ("Thinking" → "Running tools" → "Composing answer").
- Express BFF that holds **one xAI Grok client** (OpenAI-compat, model `grok-4-1-fast-non-reasoning`) and talks to the MCP server via raw JSON-RPC over Streamable HTTP. It does **not** import `core/` — the round-trip is the proof.
- Streaming: server-sent events from BFF → frontend. Text chunks stream token-by-token; tool calls emit a dedicated event with the tool name + args + status.

### Conversation flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as web/src (React)
    participant BFF as web/server (Express)
    participant LLM as xAI Grok
    participant MCP as MCP server

    User->>UI: "I run a spa in Madrid charging 60€..."
    UI->>BFF: POST /chat (SSE)
    BFF->>MCP: tools/list (JSON-RPC)
    MCP-->>BFF: 10 tools + schemas
    BFF->>LLM: chat.completions(messages, tools)
    LLM-->>BFF: tool_call analyze_market{cat,loc}
    BFF-->>UI: event: tool_call
    Note over UI: ToolBadge "calling analyze_market…"
    BFF->>MCP: tools/call analyze_market
    MCP-->>BFF: structuredContent{prices, top performers}
    BFF-->>UI: event: tool_result (ok, snippet)
    BFF->>LLM: continue with tool result
    LLM-->>BFF: streamed answer tokens
    BFF-->>UI: event: text (×N)
    Note over UI: dots stop, answer streams in
    BFF-->>UI: event: done
```

### Run locally

```bash
# Terminal 1 — MCP server (Streamable HTTP)
npm run build
MCP_TRANSPORT=http node dist/mcp/server.js

# Terminal 2 — BFF + frontend (concurrently)
cd web && npm install && npm run dev
# Opens http://localhost:5173 with proxy to BFF on :3000
```

See [`web/README.md`](web/README.md) for the full subproject docs.

---

## Where the data comes from

The catalogue is built by a one-shot Python pipeline (`ingestion/`) using
[Scrapling](https://github.com/D4Vinci/Scrapling) — a stealth-fetcher
that bundles Patchright + Camoufox + TLS fingerprint spoofing and solves
Cloudflare Turnstile natively.

| Step | What happens | Where |
|---|---|---|
| **Discover** | Two sources: 14 listings at `groupon.es/ofertas/{slug}` (7 cities × city + category pages) plus sitemap-driven sampling (`/sitemap.xml` + gzip child sitemaps) for up to N additional deals. Union, deduplicated by URL. | `scraper.py` |
| **Fetch** | One Scrapling `StealthySession` per deal page, concurrency capped at 1 to keep detection surface low. | `scraper.py` |
| **Parse** | Cascade: Schema.org **JSON-LD** first (`ProductGroup`, `BreadcrumbList`, `AggregateRating`) → `data-testid` → OpenGraph → DOM heuristics. JSON-LD is the contract Groupon must keep for Google. | `parsers/deal_page.py` |
| **Normalise** | pydantic — currency to cents, percent to int, rating to float, merchant id slugified, dedupe by canonical URL. | `normalizer.py` |
| **Embed** | `title + description` → 1536-dim vector via OpenAI `text-embedding-3-small` (or Ollama `nomic-embed-text`, right-padded). | `embedder.py` |
| **Write** | SQLite with [sqlite-vec](https://github.com/asg017/sqlite-vec) for KNN, plus pre-aggregated `categories` / `locations` / `merchants` tables. | `embedder.py` → `data/deals.sqlite` |

Shipped dataset (`data/sample-deals.json`, committed): **77 deals across
11 Spanish cities and 8 categories, 75 unique merchants**. 100% have a
price, 53% have an explicit discount, 71% have a customer rating.

Full pipeline docs, flags and reproduction steps:
[`ingestion/README.md`](ingestion/README.md).

---

## Data layer

A single `data/deals.sqlite` file with [sqlite-vec](https://github.com/asg017/sqlite-vec) for KNN. Zero external infrastructure.

```mermaid
erDiagram
    deals ||--o| merchants : "merchant_id"
    deals ||--|| categories : "category_slug"
    deals ||--|| locations : "location_slug"
    deals ||--|| deal_vectors : "deal_id"
    deals {
        TEXT id PK
        TEXT url
        TEXT title
        INTEGER price_cents
        INTEGER discount_pct
        REAL rating
        INTEGER reviews_count
    }
    deal_vectors {
        TEXT deal_id PK
        FLOAT_1536 embedding
    }
    categories {
        TEXT slug PK
        INTEGER deal_count
    }
    locations {
        TEXT slug PK
        INTEGER deal_count
    }
    merchants {
        TEXT id PK
        REAL rating_avg
        INTEGER deal_count
    }
```

The 1536-dimensional vector slot fits OpenAI `text-embedding-3-small` natively and right-pads smaller models (Ollama `nomic-embed-text` is 768d). Trade-off: ~3 MB of zero-padding per 500 deals in exchange for **provider portability without a migration**.

---

## Engineering decisions

### Reading data, not chasing class names

The deal-page parser tries Schema.org JSON-LD **first** (every Groupon deal page ships a `ProductGroup`, a `BreadcrumbList` and an `AggregateRating`), `data-testid` attributes second, OpenGraph third, and DOM heuristics last. That makes the pipeline robust to A/B-test layouts — JSON-LD is a contract Groupon needs to keep for Google.

### Anti-stdout discipline

MCP stdio dies the moment any non-JSON-RPC byte hits stdout. We enforce this two ways:

1. **`pino` is configured with `pino.destination(2)`** — every log line goes to stderr.
2. **ESLint has a `no-console: error` rule scoped to `src/mcp/**`** — even an accidental `console.log` fails the build.

### Deterministic-then-LLM, not LLM-everywhere

`compare_deals` and `analyze_market` use **deterministic scoring + analytics** before any LLM call. The LLM downstream gets the numbers and ranks the explanation — it doesn't have to invent the math. This is the same Chain-of-Thought hygiene that keeps an agent from hallucinating prices.

### Provider abstraction over OpenAI-compatible

`OpenAIEmbeddingsProvider` accepts an `OPENAI_BASE_URL`, so the **same code path** works against:

- OpenAI directly
- OpenRouter (one key, many providers — the project's default)
- Azure OpenAI deployments
- Any future drop-in gateway

Switch with one env var.

---

## How AI was used in this project

> _The brief says "How you use AI is part of what we're evaluating, not a side note." — so here's the honest answer._

**Claude Code** was my pair throughout. I drove design, decisions and review; Claude drafted and modified code under my direction. Concretely:

- **Architecture and stack choices** are mine. The hybrid Python + TS split, the pre-ingestion-not-request-time-scraping decision, the shared-`core/`-two-interfaces principle, the "Schema.org JSON-LD first" parser strategy, the provider abstraction over `OPENAI_BASE_URL` — those came out of conversations and explicit calls.
- **Boilerplate-y code generation** (Zod schemas mirroring SQL columns, command files mirroring tool files, type annotations for `ScrapedDeal` / `NormalizedDeal`, the table renderer) was largely Claude-drafted and code-reviewed by me. Every file got a read-through before commit.
- **Iteration over reality**: when the first scrape returned 404s because I'd guessed the URL pattern wrong, I wrote a discovery script first (the kind of thing a senior engineer reaches for), inspected the actual JSON-LD, and rewrote the parser. That round-trip wouldn't have been any faster without AI — the bottleneck was the real-world ground truth.
- **Test design** was mine; test code was largely Claude-drafted under tight guidance. The `InMemoryTransport` pattern came from reading the official MCP SDK source.

There are no hidden prompts, no `# generated by` headers stripped. The repo history is what actually happened.

---

## Trade-offs

See [`docs/trade-offs.md`](docs/trade-offs.md) for the long version. The short list:

- **77 deals**, not 5 000. Sitemap-driven discovery + 14 city/category listings; for a take-home demo, depth beat breadth. Production would add scroll-triggered pagination + scheduled diff-only re-ingest.
- **One-shot ingestion**, not scheduled. The pipeline is a script, not a service. Production would wrap it in a cron + diff-only re-embedding.
- **Stdio + Streamable HTTP** — both wired and tested. Stdio for Claude Desktop / Inspector; HTTP (`MCP_TRANSPORT=http`, default port 3333) for any production-style consumer. Stateless mode — no sessions, no in-memory message log.
- **Adaptive selectors disabled** — Scrapling's auto-relocation is intriguing but undocumented. A one-shot pipeline doesn't need it.
- **English-only system prompts in `instructions`** — the user-visible content stays Spanish (the source of truth), but I write for the LLM in English to keep the agent's reasoning sharper.

---

## Next steps

See [`docs/next-steps.md`](docs/next-steps.md). Headlines:

- Real-time deal monitoring with a scheduled re-ingest + change-only embeddings.
- Multi-locale (`groupon.com`, `.de`, `.fr`) using the same JSON-LD parser.
- A third interface: HTTP API mirroring the CLI/MCP surface for internal service consumers.
- LLM-based deal-copy improvement suggestions (a `suggest_better_title` tool) using the same provider abstraction.
- Merchant-facing dashboard on top of `analyze_market`.

---

## Repo layout

```
groupon-deal-intelligence-mcp/
├── ingestion/                 Python — Scrapling pipeline + scripts
│   └── src/groupon_ingest/    scraper, parsers, normalizer, embedder, cli
├── src/
│   ├── core/                  intelligence layer (search, scoring, market, store)
│   ├── mcp/                   MCP server: 10 tools, 3 resources, 3 prompts
│   ├── cli/                   commander-based CLI: 12 commands, 3 formats
│   └── shared/                pino → stderr, zod config, McpError helpers
├── data/
│   ├── sample-deals.json      77 real deals, committed for reviewers
│   └── deals.sqlite           gitignored — regenerated by ingest
├── docs/                      architecture, ai-usage, trade-offs, next-steps
├── tests/                     vitest: 36 assertions across core + MCP
├── Dockerfile.mcp             Node 22 runtime image
├── Dockerfile.ingest          Scrapling-based ingest image
└── docker-compose.yml         two-step pipeline
```

---

## Time spent

**~5 hours focused work** on 2026-05-15. The repo history reflects the real flow — first commit at 11:05 local, last by ~16:00, with one round-trip to inspect real groupon.es HTML when my first URL pattern returned 404s.

---

## License

MIT — see [`LICENSE`](LICENSE).
