"""Parse a groupon.es category listing page to extract individual deal URLs.

Strategy: be tolerant. Try several selector variants because groupon.es A/B
tests its layouts. We log when a selector fails and fall back to the next.
"""

from __future__ import annotations

import logging
from urllib.parse import urljoin, urlparse

logger = logging.getLogger(__name__)

# Selector candidates ordered from most-specific to most-permissive.
# Each is tried in turn until one returns at least 5 matches.
DEAL_LINK_SELECTORS = [
    "a[data-bhc='dealcard']",
    "a[data-testid='deal-card']",
    "div[data-bhw='DealCard'] a",
    "a.deal-card-link",
    "a[href*='/deals/'][href*='-']",  # last resort: any /deals/<slug>/<deal-slug>/ link
]


def _is_deal_url(href: str) -> bool:
    """A deal URL on groupon.es looks like /deals/<location>/<deal-slug>."""
    try:
        path = urlparse(href).path
    except Exception:
        return False
    parts = [p for p in path.split("/") if p]
    # We want /deals/<location-slug>/<deal-slug>, ignoring category index pages
    return len(parts) >= 3 and parts[0] == "deals" and not parts[-1].startswith("c-")


def extract_deal_urls(page, base_url: str = "https://www.groupon.es") -> list[str]:
    """Return the unique, fully-qualified deal URLs found on a category page."""
    found: set[str] = set()

    for selector in DEAL_LINK_SELECTORS:
        try:
            anchors = page.css(selector)
        except Exception as exc:
            logger.debug("Selector %s raised: %s", selector, exc)
            continue

        for anchor in anchors:
            href = anchor.attrib.get("href", "")
            if not href:
                continue
            absolute = urljoin(base_url, href)
            if _is_deal_url(absolute):
                found.add(absolute.split("?")[0])  # strip tracking params

        if len(found) >= 5:
            logger.debug(
                "Selector %s yielded %d deal URLs (taking it)", selector, len(found)
            )
            break

    return sorted(found)
