"""Normalize ScrapedDeal blobs into validated NormalizedDeal records.

Responsibilities:
- Currency parsing (Spanish-format "29,99 €" → 2999 cents)
- Percent parsing ("-60 %", "60% off" → 60)
- Rating extraction (handles "4,5", "4.5/5")
- Reviews count ("(1.234 valoraciones)" → 1234)
- Slug derivation
- Merchant id from name (kebab-case)
- Deduplication by url
"""

from __future__ import annotations

import logging
import re
import unicodedata
from urllib.parse import urlparse

from groupon_ingest.models import NormalizedDeal, ScrapedDeal

logger = logging.getLogger(__name__)


# --- helpers ---------------------------------------------------------------


def _slugify(text: str) -> str:
    """ASCII kebab-case slug. 'Estética Y Spa' → 'estetica-y-spa'."""
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    lowered = ascii_text.lower()
    return re.sub(r"[^a-z0-9]+", "-", lowered).strip("-")


def _derive_slug_from_url(url: str) -> str:
    path = urlparse(url).path
    parts = [p for p in path.split("/") if p]
    return parts[-1] if parts else "unknown"


def parse_price_cents(raw: str | None) -> int | None:
    """Spanish currency format: '29,99 €' → 2999. Returns None if unparseable."""
    if not raw:
        return None
    # Find the first number with optional decimal (comma or dot)
    match = re.search(r"(\d{1,4}(?:[.,]\d{1,2})?)", raw.replace(".", ""))
    if not match:
        return None
    number_str = match.group(1).replace(",", ".")
    try:
        return int(round(float(number_str) * 100))
    except ValueError:
        return None


def parse_percent(raw: str | None) -> int | None:
    """'-60 %' → 60, '60% off' → 60. Returns absolute value, capped 0-100."""
    if not raw:
        return None
    match = re.search(r"(\d{1,3})\s*%", raw)
    if not match:
        return None
    try:
        pct = int(match.group(1))
        return max(0, min(100, pct))
    except ValueError:
        return None


def parse_rating(raw: str | None) -> float | None:
    """'4,5' or '4.5/5' → 4.5. Capped 0.0-5.0."""
    if not raw:
        return None
    match = re.search(r"(\d(?:[.,]\d)?)", raw)
    if not match:
        return None
    try:
        rating = float(match.group(1).replace(",", "."))
        return max(0.0, min(5.0, rating))
    except ValueError:
        return None


def parse_reviews_count(raw: str | None) -> int | None:
    """'(1.234 valoraciones)' → 1234, '345 reviews' → 345."""
    if not raw:
        return None
    # Strip thousands separators (Spanish uses '.')
    cleaned = re.sub(r"\.(?=\d{3})", "", raw)
    match = re.search(r"(\d+)", cleaned)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


# --- main entrypoint -------------------------------------------------------


def normalize_deal(scraped: ScrapedDeal) -> NormalizedDeal | None:
    """Validate and normalize a scraped deal. Returns None if title is missing.

    Title is the only truly required field — without it the deal is unusable
    for semantic search and we drop it (logged).
    """
    if not scraped.title:
        logger.warning("Dropping deal without title: %s", scraped.url)
        return None

    if not scraped.category_slug or not scraped.location_slug:
        logger.warning(
            "Dropping deal without category/location: %s (cat=%s loc=%s)",
            scraped.url,
            scraped.category_slug,
            scraped.location_slug,
        )
        return None

    slug = _derive_slug_from_url(str(scraped.url))
    merchant_id = _slugify(scraped.merchant_name) if scraped.merchant_name else None

    return NormalizedDeal(
        id=slug,
        url=str(scraped.url),  # type: ignore[arg-type]  # pydantic re-validates
        title=scraped.title.strip(),
        description=scraped.description.strip() if scraped.description else None,
        merchant_id=merchant_id,
        merchant_name=scraped.merchant_name.strip() if scraped.merchant_name else None,
        category_slug=scraped.category_slug,
        location_slug=scraped.location_slug,
        price_cents=parse_price_cents(scraped.price_raw),
        original_price_cents=parse_price_cents(scraped.original_price_raw),
        discount_pct=parse_percent(scraped.discount_raw),
        rating=parse_rating(scraped.rating_raw),
        reviews_count=parse_reviews_count(scraped.reviews_count_raw),
        image_url=scraped.image_url,  # type: ignore[arg-type]
        scraped_at=scraped.scraped_at,
        raw=scraped.model_dump(mode="json"),
    )


def dedupe(deals: list[NormalizedDeal]) -> list[NormalizedDeal]:
    """Keep the first occurrence of each id, drop the rest."""
    seen: set[str] = set()
    unique: list[NormalizedDeal] = []
    for deal in deals:
        if deal.id in seen:
            continue
        seen.add(deal.id)
        unique.append(deal)
    return unique
