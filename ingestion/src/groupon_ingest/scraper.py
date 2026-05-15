"""Orchestrate Scrapling sessions to scrape groupon.es deals end-to-end.

Pipeline:
1. Load seeds.json — a flat list of /ofertas/{slug} listings (both city
   and category surfaces).
2. For each listing, fetch and extract /deals/<slug> URLs.
3. Globally deduplicate URLs.
4. For each unique deal URL, fetch and parse the deal page; infer
   category and location from its breadcrumb.
5. Normalize, dedupe by id, return.

Each listing and each deal is wrapped in try/except — one failure never
kills the run. Random jitter (1-2.5s) between fetches keeps the
detection surface low.
"""

from __future__ import annotations

import json
import logging
import random
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from groupon_ingest.models import (
    Category,
    Listing,
    Location,
    Merchant,
    NormalizedDeal,
    ScrapingResult,
)
from groupon_ingest.normalizer import dedupe, normalize_deal
from groupon_ingest.parsers import extract_deal_urls, parse_deal_page

logger = logging.getLogger(__name__)


def load_seeds(seeds_path: Path) -> dict[str, Any]:
    return json.loads(seeds_path.read_text(encoding="utf-8"))


def build_listings(
    seeds: dict[str, Any],
    filter_kinds: list[str] | None = None,
    filter_slugs: list[str] | None = None,
) -> list[Listing]:
    """Build Listing objects from seeds, optionally filtered."""
    listings = [Listing(**item) for item in seeds["listings"]]
    if filter_kinds:
        listings = [l for l in listings if l.kind in filter_kinds]
    if filter_slugs:
        listings = [l for l in listings if l.slug in filter_slugs]
    return listings


def _jitter(min_ms: int = 1000, max_ms: int = 2500) -> None:
    time.sleep(random.uniform(min_ms / 1000, max_ms / 1000))


def scrape(
    listings: list[Listing],
    base_url: str = "https://www.groupon.es",
    max_deals_per_listing: int = 10,
    headless: bool = True,
    solve_cloudflare: bool = True,
    request_timeout_ms: int = 60_000,
    progress_callback: Callable[[NormalizedDeal], None] | None = None,
) -> ScrapingResult:
    """Run the full pipeline. Returns ScrapingResult."""

    # Late import — Scrapling's eager browser checks (upstream issue 92).
    from scrapling.fetchers import StealthySession  # noqa: PLC0415

    started_at = datetime.utcnow()
    completed = 0
    failed = 0
    notes: list[str] = []
    candidate_urls: set[str] = set()
    deal_url_to_listing: dict[str, Listing] = {}

    with StealthySession(
        solve_cloudflare=solve_cloudflare,
        real_chrome=True,
        headless=headless,
        google_search=True,
        block_webrtc=True,
        max_pages=1,
    ) as session:
        # ---- pass 1: gather candidate URLs from all listings ----
        for idx, listing in enumerate(listings, start=1):
            url = listing.full_url(base_url)
            logger.info(
                "[listing %d/%d] %s (%s) → %s",
                idx,
                len(listings),
                listing.name,
                listing.kind,
                url,
            )
            try:
                page = session.fetch(url, timeout=request_timeout_ms, wait=2000)
            except Exception as exc:
                logger.error("Listing fetch failed for %s: %s", url, exc)
                failed += 1
                notes.append(f"listing_failed:{listing.slug}")
                continue

            extracted = extract_deal_urls(page, base_url=base_url)
            new_count = 0
            for deal_url in extracted[:max_deals_per_listing]:
                if deal_url not in candidate_urls:
                    new_count += 1
                candidate_urls.add(deal_url)
                # Record the *first* listing in which we saw this deal — useful
                # as a fallback when the deal page itself doesn't expose
                # category/location.
                deal_url_to_listing.setdefault(deal_url, listing)

            logger.info("  → %d total, %d new", len(extracted), new_count)
            if not extracted:
                notes.append(f"empty_listing:{listing.slug}")
            completed += 1
            _jitter(500, 1500)  # quick jitter between listings

        logger.info("Collected %d unique candidate deal URLs", len(candidate_urls))

        # ---- pass 2: visit each deal page once ----
        deals: list[NormalizedDeal] = []
        for idx, deal_url in enumerate(sorted(candidate_urls), start=1):
            logger.info("[deal %d/%d] %s", idx, len(candidate_urls), deal_url)
            _jitter()
            try:
                deal_page = session.fetch(
                    deal_url, timeout=request_timeout_ms, wait=1500
                )
            except Exception as exc:
                logger.warning("Deal fetch failed for %s: %s", deal_url, exc)
                failed += 1
                notes.append(f"deal_failed:{deal_url}")
                continue

            source_listing = deal_url_to_listing.get(deal_url)
            fallback_cat = source_listing.slug if source_listing and source_listing.kind == "category" else None
            fallback_loc = source_listing.slug if source_listing and source_listing.kind == "city" else None

            try:
                scraped = parse_deal_page(
                    deal_page,
                    deal_url,
                    fallback_category=fallback_cat,
                    fallback_location=fallback_loc,
                )
                normalized = normalize_deal(scraped)
                if normalized:
                    deals.append(normalized)
                    if progress_callback:
                        progress_callback(normalized)
            except Exception as exc:
                logger.warning("Parse failed for %s: %s", deal_url, exc)
                failed += 1

    deals = dedupe(deals)

    # ---- aggregate categories / locations / merchants ----
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

    # Build category/location records from observed data — robust to seeds
    # being out of sync with what's actually scraped
    categories = [
        Category(slug=s, name=s.replace("-", " ").title(), deal_count=c)
        for s, c in sorted(cat_counts.items())
    ]
    locations = [
        Location(slug=s, name=s.replace("-", " ").title(), deal_count=c)
        for s, c in sorted(loc_counts.items())
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
        listings_completed=completed,
        listings_failed=failed,
        started_at=started_at,
        finished_at=datetime.utcnow(),
        notes=notes,
    )
