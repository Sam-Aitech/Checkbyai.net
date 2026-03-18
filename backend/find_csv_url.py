#!/usr/bin/env python3
"""
Scrapling-based CSV URL discovery with HTML table fallback.

Two usage modes:
  1. Subprocess (called by Node.js via execFile):
       python3 backend/find_csv_url.py
     Exits 0 and prints one JSON line:
       {"url": "...csv"}
       {"html_records": [...], "warning": "..."}
       {"error": "..."}

  2. Import (called by sponsor_etl.py):
       from find_csv_url import get_csv_url
       url = get_csv_url()   # returns str or raises RuntimeError
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


def get_csv_url() -> str:
    """
    Importable entry point: discover and return the Gov.uk CSV URL.
    Tries Scrapling Fetcher (Phase 1), then StealthyFetcher (Phase 2).
    Raises RuntimeError if no CSV link is found after all phases.
    Does NOT fall back to HTML table — callers should use the full
    find_csv_url() subprocess path when HTML fallback is acceptable.
    """
    # Phase 1: fast plain HTTP
    try:
        from scrapling.fetchers import Fetcher
        page = Fetcher.get(GOV_UK_PAGE, timeout=30)
        url = _find_in_hrefs(page.css("a::attr(href)").getall())
        if url:
            return url
        print("[find_csv_url] Phase 1: no CSV link — escalating", file=sys.stderr)
    except Exception as exc:
        print(f"[find_csv_url] Phase 1 failed ({exc}) — escalating", file=sys.stderr)

    # Phase 2: stealthy browser
    try:
        from scrapling.fetchers import StealthyFetcher
        page = StealthyFetcher.fetch(GOV_UK_PAGE, headless=True, timeout=60)
        url = _find_in_hrefs(page.css("a::attr(href)").getall())
        if url:
            return url
        print("[find_csv_url] Phase 2: no CSV link found", file=sys.stderr)
    except Exception as exc:
        print(f"[find_csv_url] Phase 2 failed ({exc})", file=sys.stderr)

    raise RuntimeError(
        "Could not discover Gov.uk CSV URL after Fetcher + StealthyFetcher attempts. "
        "The page structure may have changed."
    )


def _parse_html_table(page) -> list | None:
    """
    Parse the HTML <table> on the gov.uk page.
    Returns a list of dicts matching SponsorRecord shape, or None if parsing fails.
    
    Expected columns: Organisation Name, Town/City, County, Type/Rating, Route
    """
    try:
        # Extract all table rows
        rows = page.css("table tbody tr").getall()
        
        if not rows:
            return None
        
        records = []
        
        for row in rows:
            # Parse <td> elements from this row
            cells = []
            for td in row.css("td"):
                text = td.css("::text").get()
                cells.append((text or "").strip())
            
            if len(cells) < 5:
                continue
            
            record = {
                "organisationName": cells[0],
                "townCity": cells[1] if len(cells) > 1 else "",
                "county": cells[2] if len(cells) > 2 else "",
                "typeRating": cells[3] if len(cells) > 3 else "",
                "route": cells[4] if len(cells) > 4 else "",
            }
            
            # Only include if organisation name is non-empty
            if record["organisationName"]:
                records.append(record)
        
        return records if records else None
    
    except Exception as exc:
        print(f"[Scrapling] HTML table parse failed: {exc}", file=sys.stderr)
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

        print(
            "[Scrapling] StealthyFetcher found no CSV link — falling back to HTML table",
            file=sys.stderr,
        )

        # Phase 3 fallback: reuse the already-fetched page to parse HTML table
        records = _parse_html_table(page)
        if records:
            print(json.dumps({
                "html_records": records,
                "warning": "WARNING: Falling back to HTML preview. Only 1,000 records will be synced."
            }))
            return

        print(json.dumps({"error": "No CSV link or HTML table found on gov.uk page (all phases exhausted)"}))
        return

    except Exception as exc:
        print(
            f"[Scrapling] StealthyFetcher failed ({exc}) — attempting HTML fallback",
            file=sys.stderr,
        )
        
        # Last-ditch Phase 3: try plain Fetcher for HTML table only
        try:
            from scrapling.fetchers import Fetcher
            
            page = Fetcher.get(GOV_UK_PAGE, timeout=30)
            records = _parse_html_table(page)
            
            if records:
                print(json.dumps({
                    "html_records": records,
                    "warning": "WARNING: Falling back to HTML preview. Only 1,000 records will be synced."
                }))
                return
        except Exception as html_exc:
            print(f"[Scrapling] HTML fallback also failed: {html_exc}", file=sys.stderr)
        
        print(json.dumps({"error": f"StealthyFetcher and all fallbacks failed. Last error: {exc}"}))


if __name__ == "__main__":
    find_csv_url()
