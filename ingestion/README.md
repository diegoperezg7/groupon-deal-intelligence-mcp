# groupon-ingest

Scrapling-based ingestion pipeline that feeds the MCP server with normalized
deal data from groupon.es.

## What it does

```
seeds.json  ─▶  Scrapling StealthySession  ─▶  parsers  ─▶  normalizer  ─▶  JSON / SQLite
   (city × category combos)    (Cloudflare-aware fetching)            (typed pydantic)
```

The output is a single `scraped.json` blob containing normalized deals plus
aggregated category/location/merchant tables. PHASE 2 of the project pipes
that file into SQLite with embeddings.

## Setup

```bash
# From the repo root, with uv (recommended) or pip
cd ingestion
uv venv && source .venv/bin/activate     # or python -m venv .venv && source ...
uv pip install -e .                       # installs scrapling[fetchers] + deps
scrapling install                         # one-time: downloads Chromium + Camoufox

# Sanity check
python -m groupon_ingest doctor
```

## Usage

```bash
# Smoke test: 5 wellness deals in Madrid
python -m groupon_ingest scrape --cities madrid --categories belleza-y-relax --max 5

# Full ingestion: 5 cities × 8 categories, 10 deals/combo (target 400 deals)
python -m groupon_ingest scrape --cities all --categories all --max 10 \
    --output ../data/scraped.json

# Inspect what's available in seeds
python -m groupon_ingest list-seeds
```

## Why Python here, TypeScript elsewhere?

Scrapling is the right tool for the job — it bundles Patchright + Camoufox +
TLS fingerprint spoofing + native Cloudflare Turnstile solving. Implementing
the same stack in TypeScript would require stitching together half a dozen
libraries with worse anti-detection profiles.

The MCP server and CLI live in TypeScript because that's what the role asks
for and because MCP's stdio transport story is best-supported there. SQLite
is the clean interface between the two worlds — one process writes, another
reads, no coupling.

See [`../docs/architecture.md`](../docs/architecture.md) (PHASE 7) for the
full reasoning.

## Layout

```
ingestion/
├── pyproject.toml
├── data/
│   └── seeds.json              # cities × categories source of truth
└── src/groupon_ingest/
    ├── __main__.py             # python -m groupon_ingest
    ├── cli.py                  # typer CLI
    ├── models.py               # pydantic schemas (ScrapedDeal, NormalizedDeal, ...)
    ├── normalizer.py           # currency/percent/rating parsing + dedupe
    ├── scraper.py              # StealthySession orchestrator
    └── parsers/
        ├── category_page.py    # extract deal URLs from listings
        └── deal_page.py        # extract structured fields from a deal page
```

## Notes

- Scrapling's adaptive selectors are off — we ship explicit selector
  cascades because a one-shot ingest doesn't benefit from auto-relocation
  and the algorithmic guarantees are undocumented.
- Concurrent fetching is capped at 1 to keep the detection surface low.
  Throughput at 5 cities × 8 categories × 10 deals = ~400 deals in 25-40 min
  is acceptable for a one-shot pipeline.
- The `--no-headless` flag opens a visible browser, useful when groupon.es
  changes its layout and selectors need to be re-verified.
