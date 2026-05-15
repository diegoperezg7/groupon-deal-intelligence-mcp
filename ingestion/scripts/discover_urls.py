"""Discover the real URL structure of groupon.es by fetching the home
page and inspecting the navigation/category links.

Output: prints candidate category and location URLs to stdout so we can
update seeds.json with real targets.
"""

from __future__ import annotations

import re
from collections import Counter
from urllib.parse import urlparse

from scrapling.fetchers import StealthySession


def main() -> None:
    home = "https://www.groupon.es/"
    print(f"Fetching {home}...")

    with StealthySession(
        solve_cloudflare=True,
        real_chrome=True,
        headless=True,
        google_search=True,
        block_webrtc=True,
        max_pages=1,
    ) as session:
        page = session.fetch(home, timeout=60_000, wait=3000)

        # Collect all internal hrefs
        hrefs: list[str] = []
        for a in page.css("a"):
            href = a.attrib.get("href", "")
            if not href or href.startswith("#") or href.startswith("javascript:"):
                continue
            if href.startswith("/"):
                href = f"https://www.groupon.es{href}"
            if "groupon.es" not in urlparse(href).netloc:
                continue
            hrefs.append(href.split("?")[0])

        # Group by URL pattern: take the first 2-3 path segments
        patterns: Counter[str] = Counter()
        for href in hrefs:
            path = urlparse(href).path.strip("/")
            parts = path.split("/")[:3]
            if parts and parts[0]:
                pattern = "/" + "/".join("{x}" if i > 0 else parts[0] for i in range(len(parts)))
                patterns[pattern] += 1

        print("\n=== URL pattern frequencies (top 20) ===")
        for pattern, count in patterns.most_common(20):
            print(f"  {count:4d}  {pattern}")

        # Find URLs that look like city + category combos
        print("\n=== Sample URLs by top patterns ===")
        sample_by_pattern: dict[str, list[str]] = {}
        for href in hrefs:
            path = urlparse(href).path.strip("/")
            parts = path.split("/")[:3]
            if parts and parts[0]:
                key = "/" + "/".join("{x}" if i > 0 else parts[0] for i in range(len(parts)))
                sample_by_pattern.setdefault(key, []).append(href)

        for pattern, _count in patterns.most_common(10):
            samples = sample_by_pattern.get(pattern, [])[:5]
            print(f"\n  Pattern: {pattern} ({len(sample_by_pattern.get(pattern, []))} hits)")
            for s in samples:
                print(f"    {s}")

        # Spot common Spanish city words and category words in path segments
        print("\n=== Segments containing likely cities ===")
        city_re = re.compile(r"(madrid|barcelona|valencia|sevilla|bilbao|malaga|zaragoza)")
        for href in hrefs[:200]:
            if city_re.search(href.lower()):
                print(f"  {href}")


if __name__ == "__main__":
    main()
