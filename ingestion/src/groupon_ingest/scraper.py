"""Orchestrate Scrapling sessions to scrape groupon.es deals end-to-end.

Strategy:
1. Build (location, category) combos from seeds.json.
2. For each combo, fetch the category listing page → extract deal URLs.
3. For each deal URL, fetch the deal page → parse fields.
4. Normalize, dedupe, return.

Robustness:
- Each combo and each deal is wrapped in try/except — one failure doesn't
  kill the run.
- Random jitter between requests (1-2.5s by default) to be respectful.
- Resumability via --skip-existing flag in the CLI (deals already present
  in output JSON are skipped).
"""

from __future__ import annotations

import json
import logging
import random
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from groupon_ingest.models import (
    Category,
    Location,
    Merchant,
    NormalizedDeal,
    ScrapeJob,
    ScrapingResult,
)
from groupon_ingest.normalizer import dedupe, normalize_deal
from groupon_ingest.parsers import extract_deal_urls, parse_deal_page

logger = logging.getLogger(__name__)


def load_seeds(seeds_path: Path) -> dict[str, Any]:
    return json.loads(seeds_path.read_text(encoding="utf-8"))


def build_jobs(
    seeds: dict[str, Any],
    cities: list[str] | None = None,
    categories: list[str] | None = None,
    max_per_combo: int = 10,
) -> list[ScrapeJob]:
    """Cartesian product of locations × categories from seeds, filtered."""
    base_url = seeds["base_url"]
    locs = seeds["locations"]
    cats = seeds["categories"]

    if cities:
        locs = [loc for loc in locs if loc["slug"] in cities]
    if categories:
        cats = [cat for cat in cats if cat["slug"] in categories]

    jobs: list[ScrapeJob] = []
    for loc in locs:
        for cat in cats:
            jobs.append(
                ScrapeJob(
                    location_slug=loc["slug"],
                    location_name=loc["name"],
                    category_slug=cat["slug"],
                    category_name=cat["name"],
                    listing_url=f"{base_url}/deals/{loc['slug']}/{cat['url_path']}",
                    max_deals=max_per_combo,
                )
            )
    return jobs


def _jitter(min_ms: int = 1000, max_ms: int = 2500) -> None:
    time.sleep(random.uniform(min_ms / 1000, max_ms / 1000))


def scrape_jobs(
    jobs: list[ScrapeJob],
    seeds: dict[str, Any],
    headless: bool = True,
    solve_cloudflare: bool = True,
    request_timeout_ms: int = 60_000,
    progress_callback: Any = None,
) -> ScrapingResult:
    """Run all scrape jobs in one StealthySession. Returns ScrapingResult."""

    # Late import — Scrapling's eager browser checks during import (issue #92)
    # mean we want to defer until we're actually about to scrape, so test
    # imports of this module don't trigger Camoufox downloads.
    from scrapling.fetchers import StealthySession  # noqa: PLC0415

    deals: list[NormalizedDeal] = []
    started_at = datetime.utcnow()
    completed = 0
    failed = 0
    notes: list[str] = []

    with StealthySession(
        solve_cloudflare=solve_cloudflare,
        real_chrome=True,
        headless=headless,
        google_search=True,
        block_webrtc=True,
        max_pages=1,  # one page at a time; concurrency would multiply detection risk
    ) as session:
        for job_idx, job in enumerate(jobs, start=1):
            logger.info(
                "[%d/%d] %s × %s → %s",
                job_idx,
                len(jobs),
                job.location_name,
                job.category_name,
                job.listing_url,
            )
            try:
                listing_page = session.fetch(
                    job.listing_url,
                    timeout=request_timeout_ms,
                    wait=2000,
                )
            except Exception as exc:
                logger.error("Listing fetch failed for %s: %s", job.listing_url, exc)
                failed += 1
                notes.append(f"listing_failed:{job.location_slug}/{job.category_slug}")
                continue

            deal_urls = extract_deal_urls(listing_page, base_url=seeds["base_url"])
            if not deal_urls:
                logger.warning("No deal URLs on %s", job.listing_url)
                notes.append(f"empty_listing:{job.location_slug}/{job.category_slug}")
                continue

            deal_urls = deal_urls[: job.max_deals]
            logger.info("  → %d candidate URLs", len(deal_urls))

            for deal_url in deal_urls:
                _jitter()
                try:
                    deal_page = session.fetch(
                        deal_url, timeout=request_timeout_ms, wait=1500
                    )
                    scraped = parse_deal_page(
                        deal_page, deal_url, category_slug=job.category_slug
                    )
                    normalized = normalize_deal(scraped)
                    if normalized:
                        deals.append(normalized)
                        if progress_callback:
                            progress_callback(normalized)
                except Exception as exc:
                    logger.warning("Deal fetch failed for %s: %s", deal_url, exc)
                    failed += 1
                    notes.append(f"deal_failed:{deal_url}")

            completed += 1

    deals = dedupe(deals)

    # Aggregate categories / locations / merchants from deals collected
    cat_counts: dict[str, int] = {}
    loc_counts: dict[str, int] = {}
    merch_data: dict[str, dict[str, Any]] = {}

    for deal in deals:
        cat_counts[deal.category_slug] = cat_counts.get(deal.category_slug, 0) + 1
        loc_counts[deal.location_slug] = loc_counts.get(deal.location_slug, 0) + 1
        if deal.merchant_id and deal.merchant_name:
            entry = merch_data.setdefault(
                deal.merchant_id,
                {"name": deal.merchant_name, "ratings": [], "count": 0},
            )
            entry["count"] += 1
            if deal.rating is not None:
                entry["ratings"].append(deal.rating)

    categories = [
        Category(
            slug=cat["slug"],
            name=cat["name"],
            deal_count=cat_counts.get(cat["slug"], 0),
        )
        for cat in seeds["categories"]
    ]
    locations = [
        Location(
            slug=loc["slug"],
            name=loc["name"],
            deal_count=loc_counts.get(loc["slug"], 0),
        )
        for loc in seeds["locations"]
    ]
    merchants = [
        Merchant(
            id=mid,
            name=data["name"],
            rating_avg=(sum(data["ratings"]) / len(data["ratings"])) if data["ratings"] else None,
            deal_count=data["count"],
        )
        for mid, data in merch_data.items()
    ]

    return ScrapingResult(
        deals=deals,
        categories=categories,
        locations=locations,
        merchants=merchants,
        jobs_completed=completed,
        jobs_failed=failed,
        started_at=started_at,
        finished_at=datetime.utcnow(),
        notes=notes,
    )
