"""Inspect a single /ofertas/{slug} listing page to understand structure."""

from __future__ import annotations

import sys
from collections import Counter
from urllib.parse import urlparse

from scrapling.fetchers import StealthySession


def main(url: str) -> None:
    print(f"Fetching {url}...")

    with StealthySession(
        solve_cloudflare=True,
        real_chrome=True,
        headless=True,
        google_search=True,
        block_webrtc=True,
        max_pages=1,
    ) as session:
        page = session.fetch(url, timeout=60_000, wait=3000)

        # All anchors
        deal_links: list[str] = []
        for a in page.css("a"):
            href = a.attrib.get("href", "")
            if "/deals/" in href:
                if href.startswith("/"):
                    href = f"https://www.groupon.es{href}"
                deal_links.append(href.split("?")[0])
        deal_links = sorted(set(deal_links))

        print(f"\nFound {len(deal_links)} unique /deals/ links")
        for link in deal_links[:10]:
            print(f"  {link}")
        if len(deal_links) > 10:
            print(f"  ... and {len(deal_links) - 10} more")

        # Look at classes used on parent elements to identify deal cards
        print("\n=== Inspecting first deal card HTML ===")
        for selector in ["[data-testid]", "[data-bhc]", "[data-bhw]"]:
            elements = page.css(selector)[:3]
            for el in elements:
                attrs = {k: v for k, v in el.attrib.items() if k.startswith("data-")}
                print(f"  {selector}: {attrs}")

        # Try common card containers
        print("\n=== Class names of elements containing /deals/ links ===")
        class_counter: Counter[str] = Counter()
        for a in page.css('a[href*="/deals/"]'):
            parent = a.parent if hasattr(a, "parent") else None
            depth = 0
            while parent is not None and depth < 5:
                cls = parent.attrib.get("class", "") if hasattr(parent, "attrib") else ""
                if cls:
                    for c in cls.split():
                        if "deal" in c.lower() or "card" in c.lower() or "tile" in c.lower():
                            class_counter[c] += 1
                parent = parent.parent if hasattr(parent, "parent") else None
                depth += 1

        for cls, count in class_counter.most_common(10):
            print(f"  {count:4d}  {cls}")

        # Look for category/breadcrumb signals on the page
        print("\n=== Possible breadcrumb / heading text ===")
        for sel in ["h1", "h2", "[class*='breadcrumb']", "[class*='heading']"]:
            for el in page.css(sel)[:3]:
                text = el.text.strip() if hasattr(el, "text") else ""
                if text and len(text) < 100:
                    print(f"  [{sel}] {text}")


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "https://www.groupon.es/ofertas/madrid"
    main(url)
