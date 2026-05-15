# groupon-ingest

The Python ingestion pipeline that scrapes groupon.es, normalises the deal
records, embeds them and writes them into the SQLite catalogue the MCP server
reads from. **One-shot pipeline**, not request-time — see
[`../docs/architecture.md`](../docs/architecture.md) for the reasoning.

## Pipeline at a glance

```
seeds.json + sitemap.xml ─┐
                          ▼
              Scrapling StealthySession        ← Cloudflare-aware fetch
              (Patchright + Camoufox)
                          │
                          ▼
                Listing & deal parsers          ← JSON-LD first,
                (parsers/category_page.py,        data-testid fallback,
                 parsers/deal_page.py)            OpenGraph last
                          │
                          ▼
                  normalizer.py                 ← currency, percent, rating;
                  (pydantic ScrapedDeal →         deduplicate by URL/id;
                   NormalizedDeal)                slugify merchant ids
                          │
                          ▼
                   scraped.json                 ← deals + categories +
                                                  locations + merchants
                          │
                          ▼ (separate step)
                   embedder.py                  ← title + description →
                   (OpenAI / Ollama)              1536-dim vector
                          │
                          ▼
                  data/deals.sqlite             ← deals + deal_vectors +
                                                  categories + locations +
                                                  merchants
```

The two stages (scrape → embed) are deliberately separate so a parser fix
doesn't burn embedding budget, and so the committed `data/sample-deals.json`
is reproducible without a network call.

## What this actually scrapes

Discovery is the **union of two sources**, both deduplicated by canonical URL:

1. **Listing pages** at `groupon.es/ofertas/{slug}` (defined in
   [`data/seeds.json`](data/seeds.json)). 14 listings total: 7 cities ×
   (city pages + category pages). Each page server-renders ~9 deals; the rest
   are JS-lazy-loaded and we don't pursue them.
2. **Sitemap-driven sampling** (`--sitemap N`). We fetch `/sitemap.xml`, walk
   the gzip child sitemaps, and pool up to N deal URLs that the listings
   never expose. This is how we sample beyond the 9-per-page SSR cap.

For each deal URL we then fetch the deal page once and run the **parser
cascade**:

| Priority | Source | Why |
|---|---|---|
| 1 | Schema.org JSON-LD (`ProductGroup`, `BreadcrumbList`, `AggregateRating`) | Stable contract Groupon needs to keep for Google. Survives A/B test layout changes. |
| 2 | `data-testid` attributes | React component identifiers — less stable than JSON-LD but more stable than class names. |
| 3 | OpenGraph meta tags | Title, image, description fallback. |
| 4 | DOM heuristics | Last resort. |

Output dataset committed at [`../data/sample-deals.json`](../data/sample-deals.json):
**77 deals, 11 cities, 8 categories, 75 unique merchants**. 100% of deals
have a price, 53% have an explicit discount, 71% have a customer rating.

## Setup

```bash
cd ingestion
uv venv && source .venv/bin/activate          # or python -m venv .venv && source ...
uv pip install -e .                            # installs scrapling[fetchers] + deps
python -m camoufox fetch                       # one-time: downloads the stealth browser

# Sanity check
python -m groupon_ingest doctor
```

`doctor` verifies Scrapling, Camoufox, pydantic, sqlite-vec and the
embeddings credentials. Run it before anything else.

## CLI commands

The Python CLI has 5 commands:

```bash
python -m groupon_ingest --help
```

### `scrape` — fetch and parse, write `scraped.json`

```bash
# Discover from listings only (the 14 in seeds.json)
python -m groupon_ingest scrape \
    --kinds all \
    --slugs all \
    --max 10 \
    --output ../data/scraped.json

# Discover from listings + 120 sitemap URLs (the configuration we shipped with)
python -m groupon_ingest scrape \
    --kinds all --slugs all \
    --max 12 \
    --sitemap 120 \
    --output ../data/scraped.json
```

Flags:

| Flag | What it does | Default |
|---|---|---|
| `--kinds` | Comma-separated: `city` / `category` / `all` (filters `seeds.json`) | `all` |
| `--slugs` | Comma-separated listing slugs (filters `seeds.json`) | `all` |
| `--max`, `-m` | Max deal URLs to take **from each listing** | `10` |
| `--sitemap` | Additionally pull up to N deal URLs from the sitemap (0 = disabled) | `0` |
| `--seeds` | Path to `seeds.json` | `data/seeds.json` |
| `--output`, `-o` | Output JSON path | `../data/scraped.json` |
| `--no-headless` | Run with a visible browser (debugging) | off |
| `--log-level` | INFO / DEBUG / WARNING | `INFO` |

### `embed` — add vector embeddings, write `data/deals.sqlite`

```bash
python -m groupon_ingest embed ../data/sample-deals.json --sqlite ../data/deals.sqlite
# Or with Ollama:
python -m groupon_ingest embed ../data/sample-deals.json --provider ollama
```

Embeds `title + description` (concatenated) per deal. Vectors are stored
in the `deal_vectors` virtual table created by sqlite-vec. The slot is
1536-dimensional — OpenAI `text-embedding-3-small` fits natively, smaller
models (Ollama `nomic-embed-text` is 768d) are right-padded with zeros so
you can swap providers without a migration.

The `merchants` table is repopulated on every embed with pre-aggregated
`deal_count` and `rating_avg` columns, so `list_merchants` and
`get_catalog_overview` don't need GROUP BY at query time.

### `ingest` — scrape + embed in one shot

```bash
python -m groupon_ingest ingest --max 12 --sitemap 120
```

Convenience wrapper around `scrape` then `embed`. Identical flags. Useful
when you want a fresh end-to-end run.

### `list-seeds` — show the listings inventory

```bash
python -m groupon_ingest list-seeds
```

Prints the 14 listings the scraper would visit. Use it to discover the
slug to pass to `--slugs`.

### `doctor` — environment health check

Verifies Scrapling, Camoufox, pydantic, sqlite-vec and the embeddings
credentials.

## Layout

```
ingestion/
├── pyproject.toml
├── README.md                            ← this file
├── data/
│   └── seeds.json                       ← 14 listings (7 cities × 2 path families)
├── scripts/                             ← one-off discovery / debugging tools
│   ├── discover_urls.py                 ← inspect groupon.es home page to find URL families
│   ├── inspect_listing.py               ← dump a /ofertas/{slug} page's structure
│   └── inspect_deal.py                  ← find working selectors on a deal page
└── src/groupon_ingest/
    ├── __main__.py                      ← python -m groupon_ingest
    ├── cli.py                           ← typer CLI (scrape, embed, ingest, doctor, list-seeds)
    ├── models.py                        ← pydantic schemas (ScrapedDeal, NormalizedDeal, ScrapingResult)
    ├── scraper.py                       ← StealthySession orchestrator + sitemap walker
    ├── parsers/
    │   ├── category_page.py             ← extract deal URLs from a listing page
    │   └── deal_page.py                 ← extract deal fields (JSON-LD → data-testid → OG → DOM)
    ├── normalizer.py                    ← currency/percent/rating + slugify merchants + dedupe
    └── embedder.py                      ← OpenAI/Ollama embeddings + SQLite write
```

The three `scripts/` files are **development tooling**, not part of the
pipeline. They were how I discovered the URL families on day 1 and how I
re-verified selectors when the parser started returning nulls. Kept in the
repo because that's the kind of thing a reviewer wants to see when asking
"how did you actually build this".

## Output formats

### `scraped.json` (what `scrape` writes)

```jsonc
{
  "deals": [
    {
      "id": "acuario-de-zaragoza-2",
      "url": "https://www.groupon.es/deals/acuario-de-zaragoza-2",
      "title": "Acuario de Zaragoza: …",
      "description": "…",
      "merchant_id": "acuario-de-zaragoza",
      "merchant_name": "Acuario de Zaragoza",
      "category_slug": "cosas-que-hacer",
      "location_slug": "zaragoza",
      "price_cents": 1349,
      "original_price_cents": 2044,
      "discount_pct": 34,
      "rating": 4.7,
      "reviews_count": 489,
      "image_url": "https://img.grouponcdn.com/…",
      "scraped_at": "2026-05-15T10:45:20.418587",
      "raw": { "price_raw": "13.49 €", "rating_raw": "4.76", … }
    },
    …
  ],
  "categories": [{ "slug": "belleza", "name": "Belleza" }, …],
  "locations":  [{ "slug": "madrid",  "name": "Madrid"  }, …],
  "merchants":  [{ "id": "acuario-de-zaragoza", "name": "Acuario de Zaragoza" }, …],
  "listings_completed": 14,
  "listings_failed": 0,
  "started_at": "…",
  "finished_at": "…"
}
```

### `data/deals.sqlite` (what `embed` writes)

Five tables — full schema in [`../src/core/store/schema.sql`](../src/core/store/schema.sql):

- `deals` — every column of `ScrapedDeal` above plus a `raw_json` blob for forensics.
- `categories(slug, name, deal_count)` — pre-aggregated counts.
- `locations(slug, name, deal_count)` — same.
- `merchants(id, name, rating_avg, deal_count)` — same plus average rating across the merchant's deals.
- `deal_vectors(deal_id, embedding FLOAT[1536])` — the virtual table that powers KNN search via sqlite-vec.

## Notes on robustness

- **Concurrent fetching is capped at 1.** Throughput is sacrificed for a
  lower detection surface — Cloudflare reads concurrent stealth sessions as
  bot signal.
- **Scrapling adaptive selectors are off.** The auto-relocation behaviour
  is intriguing but undocumented; for a one-shot ingest the explicit
  selector cascade is more predictable.
- **`--no-headless`** opens a visible Chromium window — useful when
  groupon.es ships a layout change and the parser needs re-verification.
- **JSON-LD is the contract.** If a future Groupon change breaks every
  `data-testid` but keeps the Schema.org markup intact (which it has to
  for Google), the parser keeps working without code changes.

## Why Python here, TypeScript elsewhere?

Scrapling is the right tool for the job — it bundles Patchright + Camoufox
+ TLS fingerprint spoofing + native Cloudflare Turnstile solving.
Implementing the same stack in TypeScript would mean stitching together
half a dozen libraries with worse anti-detection profiles.

The MCP server and CLI live in TypeScript because the role asks for it and
because MCP's stdio transport story is best-supported there. SQLite is the
clean interface between the two worlds — one process writes, another
reads, no FFI, no shared dependency tree.

See [`../docs/architecture.md`](../docs/architecture.md) for the full
reasoning and [`../docs/trade-offs.md`](../docs/trade-offs.md) for what
production-grade would add on top.
