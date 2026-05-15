"""Inspect a deal page to discover working selectors for title, price, etc."""

from __future__ import annotations

import re
import sys

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

        print("\n=== Meta tags ===")
        for sel in [
            "meta[property='og:title']",
            "meta[name='description']",
            "meta[property='og:description']",
            "meta[property='og:image']",
            "title",
        ]:
            try:
                el = page.css_first(sel)
            except Exception:
                el = None
            if el is None:
                print(f"  {sel}: <not found>")
                continue
            content = el.attrib.get("content") if hasattr(el, "attrib") else None
            text = el.text if hasattr(el, "text") else None
            print(f"  {sel}: content={content!r} text={text!r}")

        print("\n=== Headings ===")
        for sel in ["h1", "h2", "h3"]:
            for el in page.css(sel)[:3]:
                text = (el.text or "").strip() if hasattr(el, "text") else ""
                if text:
                    print(f"  [{sel}] {text[:100]}")

        # Look at data-bhc / data-bhw structure
        print("\n=== data-bhc values (first 30 unique) ===")
        seen: set[str] = set()
        for el in page.css("[data-bhc]"):
            bhc = el.attrib.get("data-bhc", "")
            if bhc and bhc not in seen:
                seen.add(bhc)
                if len(seen) > 30:
                    break
        for s in sorted(seen):
            print(f"  {s}")

        # Hunt for price strings
        print("\n=== Elements containing € or EUR ===")
        html = page.body.decode(errors="ignore") if hasattr(page, "body") else page.html_content
        if html:
            # Quick regex sweep
            prices = re.findall(r"[\d.,]+\s*€|EUR\s*[\d.,]+|\€\s*[\d.,]+", html)
            unique_prices = sorted(set(prices))[:15]
            for p in unique_prices:
                print(f"  {p}")

        # Look at all data-testid
        print("\n=== data-testid values (first 30 unique) ===")
        seen2: set[str] = set()
        for el in page.css("[data-testid]"):
            v = el.attrib.get("data-testid", "")
            if v and v not in seen2:
                seen2.add(v)
                if len(seen2) > 30:
                    break
        for s in sorted(seen2):
            print(f"  {s}")

        # JSON-LD presence
        print("\n=== JSON-LD scripts ===")
        for sc in page.css('script[type="application/ld+json"]'):
            text = sc.text if hasattr(sc, "text") else None
            if text:
                snippet = text[:300].replace("\n", " ")
                print(f"  {snippet}")
                print("  ---")


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "https://www.groupon.es/deals/blisstopia-masajes-1"
    main(url)
