"""Parse a single groupon.es deal page into a ScrapedDeal.

We extract permissively: every field is best-effort, missing data is logged
but doesn't fail the page. Normalization (price -> cents, percent parsing,
slug derivation) happens in normalizer.py.
"""

from __future__ import annotations

import logging
import re
from urllib.parse import urlparse

from groupon_ingest.models import ScrapedDeal

logger = logging.getLogger(__name__)


def _first_text(page, selectors: list[str]) -> str | None:
    """Try multiple selectors and return the first text match."""
    for sel in selectors:
        try:
            element = page.css_first(sel)
        except Exception as exc:
            logger.debug("Selector %s raised: %s", sel, exc)
            continue
        if element is None:
            continue
        text = element.text.strip() if hasattr(element, "text") else ""
        if text:
            return text
    return None


def _meta_content(page, selector: str) -> str | None:
    try:
        element = page.css_first(selector)
    except Exception:
        return None
    if element is None:
        return None
    return element.attrib.get("content")


def _derive_slug_from_url(url: str) -> str:
    """e.g. https://www.groupon.es/deals/madrid/spa-paraiso → spa-paraiso"""
    path = urlparse(url).path
    parts = [p for p in path.split("/") if p]
    return parts[-1] if parts else url


def _derive_location_from_url(url: str) -> str | None:
    path = urlparse(url).path
    parts = [p for p in path.split("/") if p]
    if len(parts) >= 2 and parts[0] == "deals":
        return parts[1]
    return None


def parse_deal_page(page, url: str, category_slug: str | None = None) -> ScrapedDeal:
    """Extract structured fields from a deal page (best-effort)."""

    title = _first_text(
        page,
        [
            "h1[data-bhc='deal-title']",
            "h1.deal-title",
            "h1[itemprop='name']",
            "h1",
        ],
    )

    description = _first_text(
        page,
        [
            "div[data-bhc='deal-pitch']",
            "div.deal-pitch",
            "div[itemprop='description']",
        ],
    ) or _meta_content(page, "meta[name='description']")

    merchant_name = _first_text(
        page,
        [
            "a[data-bhc='merchant-name']",
            "span.merchant-name",
            "a.merchant-link",
            "[itemprop='brand']",
        ],
    )

    price_raw = _first_text(
        page,
        [
            "[data-bhc='deal-price']",
            "span.price",
            "[itemprop='price']",
            ".deal-price",
        ],
    )

    original_price_raw = _first_text(
        page,
        [
            "[data-bhc='original-price']",
            "span.original-price",
            "span.was-price",
            "del",
        ],
    )

    discount_raw = _first_text(
        page,
        [
            "[data-bhc='discount']",
            ".discount-badge",
            "span.discount",
        ],
    )

    rating_raw = _first_text(
        page,
        [
            "[data-bhc='rating']",
            "[itemprop='ratingValue']",
            ".rating-value",
        ],
    )

    reviews_count_raw = _first_text(
        page,
        [
            "[data-bhc='reviews-count']",
            "[itemprop='reviewCount']",
            ".reviews-count",
        ],
    )

    image_url = _meta_content(page, "meta[property='og:image']")

    # Heuristic discount fallback: derive from prices if both present
    if discount_raw is None and price_raw and original_price_raw:
        price_match = re.search(r"(\d+[.,]?\d*)", price_raw)
        original_match = re.search(r"(\d+[.,]?\d*)", original_price_raw)
        if price_match and original_match:
            try:
                price = float(price_match.group(1).replace(",", "."))
                original = float(original_match.group(1).replace(",", "."))
                if original > 0 and price < original:
                    pct = round((1 - price / original) * 100)
                    discount_raw = f"-{pct}%"
            except (ValueError, ZeroDivisionError):
                pass

    deal = ScrapedDeal(
        url=url,
        title=title,
        description=description,
        merchant_name=merchant_name,
        category_slug=category_slug,
        location_slug=_derive_location_from_url(url),
        price_raw=price_raw,
        original_price_raw=original_price_raw,
        discount_raw=discount_raw,
        rating_raw=rating_raw,
        reviews_count_raw=reviews_count_raw,
        image_url=image_url,
    )

    if title is None:
        logger.warning("No title extracted for %s", url)

    return deal
