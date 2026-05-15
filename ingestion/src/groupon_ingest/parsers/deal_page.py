"""Parse a single groupon.es deal page into a ScrapedDeal.

Strategy (most robust to least):
1. **JSON-LD structured data**. Groupon embeds Schema.org Product /
   ProductGroup / HealthAndBeautyBusiness blocks plus a BreadcrumbList.
   This is the primary source of truth — Schema.org is contractually
   stable and survives layout changes.
2. **data-testid attributes**. Stable across A/B tests because they
   exist for QA tooling. Used for price/discount that don't always
   appear in JSON-LD.
3. **OpenGraph meta tags**. Always present, useful for description
   and image fallback.
4. **DOM heuristics**. Last resort, fragile.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any
from urllib.parse import urlparse

from groupon_ingest.models import ScrapedDeal

logger = logging.getLogger(__name__)


# Canonical Spanish city slugs we recognise in breadcrumb labels and titles
SPANISH_CITY_SLUGS = {
    "madrid",
    "barcelona",
    "valencia",
    "sevilla",
    "bilbao",
    "malaga",
    "zaragoza",
    "alicante",
    "granada",
    "murcia",
    "palma",
    "cordoba",
    "vigo",
    "gijon",
    "santander",
    "pamplona",
}

# Map breadcrumb / keyword tokens to canonical category slugs
CATEGORY_KEYWORD_MAP: list[tuple[str, str]] = [
    # Order matters: more specific first
    ("belleza", "belleza"),
    ("estetic", "belleza"),
    ("spa", "bienestar"),
    ("masaje", "bienestar"),
    ("wellness", "bienestar"),
    ("bienestar", "bienestar"),
    ("balneario", "bienestar"),
    ("gastronom", "gastronomia"),
    ("restaurant", "gastronomia"),
    ("comer", "gastronomia"),
    ("cena", "gastronomia"),
    ("brunch", "gastronomia"),
    ("escapad", "escapadas"),
    ("hotel", "escapadas"),
    ("viaje", "escapadas"),
    ("rural", "escapadas"),
    ("curso", "cursos"),
    ("taller", "cursos"),
    ("formaci", "cursos"),
    ("cine", "cosas-que-hacer"),
    ("entrad", "cosas-que-hacer"),
    ("ocio", "cosas-que-hacer"),
    ("actividad", "cosas-que-hacer"),
    ("aventura", "cosas-que-hacer"),
    ("parque", "cosas-que-hacer"),
    ("zoo", "cosas-que-hacer"),
    ("musical", "cosas-que-hacer"),
    ("escape", "cosas-que-hacer"),
    ("regalo", "regalos"),
    ("electronic", "electronica"),
    ("itv", "automocion"),
    ("coche", "automocion"),
    ("automoci", "automocion"),
    ("optic", "salud"),
    ("dental", "salud"),
    ("medic", "salud"),
    ("salud", "salud"),
    ("servicios", "servicios"),
]


# ----------------------------------------------------------------------
# JSON-LD extraction
# ----------------------------------------------------------------------


def _extract_jsonld_blocks(page) -> list[Any]:
    """Return a flat list of decoded JSON-LD blocks. Tolerant to arrays."""
    blocks: list[Any] = []
    try:
        scripts = page.css('script[type="application/ld+json"]')
    except Exception:
        return blocks
    for sc in scripts:
        text = sc.text if hasattr(sc, "text") else None
        if not text:
            continue
        try:
            decoded = json.loads(text)
        except json.JSONDecodeError:
            logger.debug("Skipping non-JSON JSON-LD block")
            continue
        if isinstance(decoded, list):
            blocks.extend(decoded)
        else:
            blocks.append(decoded)
    return blocks


def _find_block(blocks: list[Any], type_keywords: list[str]) -> dict[str, Any] | None:
    """Return the first JSON-LD block whose @type matches any keyword."""
    lower_keywords = [k.lower() for k in type_keywords]
    for blk in blocks:
        if not isinstance(blk, dict):
            continue
        types = blk.get("@type")
        if isinstance(types, str):
            types = [types]
        if not isinstance(types, list):
            continue
        for t in types:
            if any(k in str(t).lower() for k in lower_keywords):
                return blk
    return None


def _normalise_image(img: Any) -> str | None:
    if isinstance(img, str):
        return img
    if isinstance(img, list) and img:
        first = img[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict):
            return first.get("url")
    if isinstance(img, dict):
        return img.get("url")
    return None


def _extract_from_jsonld(page, url: str) -> dict[str, Any]:
    """Return a partial dict of fields extracted from JSON-LD."""
    blocks = _extract_jsonld_blocks(page)
    out: dict[str, Any] = {}

    product = _find_block(
        blocks, ["ProductGroup", "Product", "HealthAndBeautyBusiness", "LocalBusiness", "Offer"]
    )
    if product:
        out["title"] = product.get("name")
        out["description"] = product.get("description")
        out["image_url"] = _normalise_image(product.get("image"))

        # Brand / merchant
        brand = product.get("brand")
        if isinstance(brand, dict):
            out["merchant_name"] = brand.get("name")
        elif isinstance(brand, str):
            out["merchant_name"] = brand

        # Offers (price)
        offers = product.get("offers")
        if isinstance(offers, list) and offers:
            offers = offers[0]
        if isinstance(offers, dict):
            price = offers.get("price") or offers.get("lowPrice")
            if price is not None:
                out["price_raw"] = f"{price} €"
            high_price = offers.get("highPrice")
            if high_price:
                out["original_price_raw"] = f"{high_price} €"

        # Aggregate rating
        rating = product.get("aggregateRating")
        if isinstance(rating, dict):
            val = rating.get("ratingValue")
            if val is not None:
                out["rating_raw"] = str(val)
            cnt = rating.get("reviewCount") or rating.get("ratingCount")
            if cnt is not None:
                out["reviews_count_raw"] = str(cnt)

    # Breadcrumb gives us category and (sometimes) location
    crumb = _find_block(blocks, ["BreadcrumbList"])
    if crumb:
        items = crumb.get("itemListElement") or []
        breadcrumb_labels = []
        for it in items:
            if isinstance(it, dict):
                label = it.get("name") or (
                    it.get("item", {}).get("name") if isinstance(it.get("item"), dict) else None
                )
                if label:
                    breadcrumb_labels.append(str(label))
        out["_breadcrumb"] = breadcrumb_labels
    else:
        out["_breadcrumb"] = []

    return out


# ----------------------------------------------------------------------
# DOM fallback helpers
# ----------------------------------------------------------------------


def _first_text(page, selectors: list[str]) -> str | None:
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


# ----------------------------------------------------------------------
# Inference helpers
# ----------------------------------------------------------------------


def _infer_location(url: str, breadcrumb: list[str], title: str | None) -> str | None:
    haystacks: list[str] = [b.lower() for b in breadcrumb]
    haystacks.append(urlparse(url).path.lower())
    if title:
        haystacks.append(title.lower())
    for city in SPANISH_CITY_SLUGS:
        for hay in haystacks:
            if city in hay:
                return city
    return None


def _infer_category(breadcrumb: list[str], title: str | None, url: str) -> str | None:
    haystacks: list[str] = [b.lower() for b in breadcrumb]
    if title:
        haystacks.append(title.lower())
    haystacks.append(urlparse(url).path.lower())
    for keyword, slug in CATEGORY_KEYWORD_MAP:
        for hay in haystacks:
            if keyword in hay:
                return slug
    return None


# ----------------------------------------------------------------------
# Public entrypoint
# ----------------------------------------------------------------------


def parse_deal_page(
    page,
    url: str,
    fallback_category: str | None = None,
    fallback_location: str | None = None,
) -> ScrapedDeal:
    """Extract structured fields from a deal page (best-effort)."""

    # 1) JSON-LD — primary source of truth
    jsonld = _extract_from_jsonld(page, url)
    breadcrumb: list[str] = jsonld.pop("_breadcrumb", []) or []

    # 2) DOM fallbacks for fields JSON-LD didn't give us
    title = jsonld.get("title") or _first_text(
        page,
        [
            "[data-testid='deal-title']",
            "h1[data-bhc='deal-title']",
            "h1.deal-title",
            "h1",
        ],
    ) or _meta_content(page, "meta[property='og:title']")

    description = jsonld.get("description") or _first_text(
        page,
        [
            "[data-testid='deal-description']",
            "div[data-bhc='deal-pitch']",
            "div.deal-pitch",
            "div[itemprop='description']",
        ],
    ) or _meta_content(page, "meta[name='description']") or _meta_content(
        page, "meta[property='og:description']"
    )

    merchant_name = jsonld.get("merchant_name") or _first_text(
        page,
        [
            "a[data-bhc='merchant-name']",
            "a[data-testid='merchant-name']",
            "span.merchant-name",
            "a.merchant-link",
        ],
    )

    price_raw = jsonld.get("price_raw") or _first_text(
        page,
        [
            "[data-testid='green-price']",
            "[data-testid='promotion-price']",
            "[data-testid='deal-price']",
            "[data-bhc='deal-price']",
            "span.price",
        ],
    )

    original_price_raw = jsonld.get("original_price_raw") or _first_text(
        page,
        [
            "[data-testid='strike-through-price']",
            "[data-testid='original-price']",
            "[data-bhc='original-price']",
            "del",
        ],
    )

    discount_raw = _first_text(
        page,
        [
            "[data-testid='discount']",
            "[data-bhc='discount']",
            "[class*='discount']",
        ],
    )

    rating_raw = jsonld.get("rating_raw") or _first_text(
        page,
        [
            "[itemprop='ratingValue']",
            "[data-testid='rating']",
            "[class*='rating-value']",
        ],
    )

    reviews_count_raw = jsonld.get("reviews_count_raw") or _first_text(
        page,
        [
            "[itemprop='reviewCount']",
            "[data-testid='reviews-count']",
            "[class*='reviews-count']",
        ],
    )

    image_url = jsonld.get("image_url") or _meta_content(
        page, "meta[property='og:image']"
    ) or _meta_content(page, "meta[name='twitter:image']")

    # 3) Inference: category + location from breadcrumb / URL / title
    inferred_location = (
        _infer_location(url, breadcrumb, title) or fallback_location
    )
    inferred_category = (
        _infer_category(breadcrumb, title, url) or fallback_category
    )

    # 4) Heuristic discount fallback when only the two prices are present
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
        category_slug=inferred_category,
        location_slug=inferred_location,
        price_raw=price_raw,
        original_price_raw=original_price_raw,
        discount_raw=discount_raw,
        rating_raw=rating_raw,
        reviews_count_raw=reviews_count_raw,
        image_url=image_url,
    )

    if title is None:
        logger.warning("No title extracted for %s", url)
    if inferred_category is None:
        logger.debug("No category inferred for %s (breadcrumb=%s)", url, breadcrumb)

    return deal
