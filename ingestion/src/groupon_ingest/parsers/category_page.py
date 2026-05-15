"""Parse a groupon.es /ofertas/{slug} listing page to extract deal URLs.

groupon.es renders ~9 deals server-side per listing; the rest load via
JS scroll. We accept this — combining multiple listings (cities +
categories) and global deduplication is the cheaper path to coverage.

The only reliable selector across layouts is the href pattern itself:
all deal pages live at /deals/<slug>.
"""

from __future__ import annotations

import logging
from urllib.parse import urljoin, urlparse

logger = logging.getLogger(__name__)


def _is_deal_url(href: str) -> bool:
    """A deal URL on groupon.es is /deals/<single-slug>, no extra path."""
    try:
        path = urlparse(href).path
    except Exception:
        return False
    parts = [p for p in path.split("/") if p]
    return len(parts) >= 2 and parts[0] == "deals" and not parts[1].startswith("c-")


def extract_deal_urls(page, base_url: str = "https://www.groupon.es") -> list[str]:
    """Return the unique, fully-qualified deal URLs found on a listing page."""
    found: set[str] = set()

    try:
        anchors = page.css('a[href*="/deals/"]')
    except Exception as exc:
        logger.warning("Failed to query anchors: %s", exc)
        return []

    for anchor in anchors:
        href = anchor.attrib.get("href", "")
        if not href:
            continue
        absolute = urljoin(base_url, href)
        if _is_deal_url(absolute):
            found.add(absolute.split("?")[0].rstrip("/"))

    sorted_urls = sorted(found)
    logger.debug("Extracted %d deal URLs", len(sorted_urls))
    return sorted_urls
