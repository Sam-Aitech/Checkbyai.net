#!/usr/bin/env python3
"""
Scrapling-based fallback for finding the UK Gov sponsor register CSV URL.

Called as a subprocess by server/utils/sponsorListFetcher.ts when the
primary cheerio scraper fails (e.g. gov.uk adds JS rendering or bot protection).

Exits with code 0 and prints one of:
  {"url": "https://assets.publishing.service.gov.uk/...csv"}   — success
  {"error": "reason string"}                                    — failure

Usage:
  python3 backend/find_csv_url.py
"""
import json
import sys

GOV_UK_PAGE = (
    "https://www.gov.uk/government/publications/"
    "register-of-licensed-sponsors-workers"
)

CSV_HOST = "assets.publishing.service.gov.uk"


def _find_in_hrefs(hrefs: list) -> str | None:
    for href in hrefs:
        if href and CSV_HOST in href and href.endswith(".csv"):
            return href
    return None


def find_csv_url() -> None:
    # ── Phase 1: Plain HTTP via Fetcher (fast, no browser overhead) ───────────
    try:
        from scrapling.fetchers import Fetcher

        page = Fetcher.get(GOV_UK_PAGE, timeout=30)
        hrefs = page.css("a::attr(href)").getall()
        url = _find_in_hrefs(hrefs)

        if url:
            print(json.dumps({"url": url}))
            return

        print(
            "[Scrapling] Fetcher found no CSV link — escalating to StealthyFetcher",
            file=sys.stderr,
        )

    except Exception as exc:
        print(
            f"[Scrapling] Fetcher failed ({exc}) — escalating to StealthyFetcher",
            file=sys.stderr,
        )

    # ── Phase 2: Browser mode via StealthyFetcher (handles JS + bot protection) ─
    try:
        from scrapling.fetchers import StealthyFetcher

        page = StealthyFetcher.fetch(GOV_UK_PAGE, headless=True, timeout=60)
        hrefs = page.css("a::attr(href)").getall()
        url = _find_in_hrefs(hrefs)

        if url:
            print(json.dumps({"url": url}))
            return

        print(json.dumps({"error": "No CSV link found on gov.uk page (both Fetcher and StealthyFetcher tried)"}))

    except Exception as exc:
        print(json.dumps({"error": f"StealthyFetcher failed: {exc}"}))


if __name__ == "__main__":
    find_csv_url()
