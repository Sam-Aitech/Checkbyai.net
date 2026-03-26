"""
Enrichment Router — Pro Intelligence Pipeline
==============================================
Two endpoints consumed by the Node.js enrichment orchestrator:

  POST /api/v1/enrich/companies-house
      Tries the official Companies House REST API first.
      Falls back to Crawl4AI stealth fetch if the API key is absent.
      Returns structured CompaniesHouseRecord JSON.

  POST /api/v1/enrich/licence-history
      Uses Crawl4AI + camoufox to scrape licensed-sponsors-uk.com.
      Detects Cloudflare Turnstile and raises a 503 so the Node worker
      can pause the queue rather than burning retries.

Error contract (used by enrichmentWorker.ts to set queue status):
  200  → success, body = { data: ... }
  404  → no match found (status = 'no_match')
  429  → rate-limited upstream (status = 'rate_limited')
  503  → CAPTCHA / Cloudflare block (status = 'captcha_blocked')
  500  → unexpected error (status = 'failed')
"""

from __future__ import annotations

import os
import re
import asyncio
import logging
import random
import unicodedata
from datetime import datetime
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from rapidfuzz import fuzz, process as rfprocess

logger = logging.getLogger("enrichment_router")

router = APIRouter(prefix="/api/v1/enrich", tags=["enrichment"])

# ── Config ─────────────────────────────────────────────────────────────────────
CH_API_KEY = os.getenv("COMPANIES_HOUSE_API_KEY", "")
CH_SEARCH_URL = "https://api.company-information.service.gov.uk/search/companies"
CH_PROFILE_URL = "https://api.company-information.service.gov.uk/company/{number}"
CH_FILING_URL  = "https://api.company-information.service.gov.uk/company/{number}/filing-history"

LSUK_BASE_URL  = os.getenv("LSUK_BASE_URL", "https://licensed-sponsors-uk.com")

FUZZY_ACCEPT    = 85   # rapidfuzz WRatio score (0–100) to auto-accept a CH match
FUZZY_FLAG      = 78   # accept but set low-confidence flag in metadata

# Cloudflare detection markers present in blocked HTML responses
CF_MARKERS = [
    "cf-turnstile",
    "challenge-form",
    "cf_chl_opt",
    "__cf_bm",
    "Checking your browser",
    "DDoS protection by Cloudflare",
]

# Rotating User-Agent pool (20 real browser strings)
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0",
    "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
]


# ── Request / Response Models ──────────────────────────────────────────────────

class EnrichRequest(BaseModel):
    fingerprint: str
    company_name: str
    town: str | None = None


class CompaniesHouseRecord(BaseModel):
    fingerprint: str
    company_number: str | None = None
    company_status: str | None = None
    company_type: str | None = None
    incorporation_date: str | None = None
    sic_codes: list[str] = []
    registered_address: str | None = None
    nature_of_business: str | None = None
    last_filed_accounts_date: str | None = None
    next_conf_stmt_due_date: str | None = None
    dissolved_at: str | None = None
    website_url: str | None = None
    historical_names: list[str] = []
    companies_house_source: bool = False
    fuzzy_match_score: float | None = None
    scraped_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class LicenceHistoryRecord(BaseModel):
    fingerprint: str
    recorded_date: str
    licence_status: str
    route: str | None = None
    type_rating: str | None = None
    organisation_name: str | None = None
    source: str = "lsuk-scrape"
    scraped_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


# ── Name normalisation helpers ─────────────────────────────────────────────────

_SUFFIX_MAP = {
    r"\blimited\b": "ltd",
    r"\bpublic limited company\b": "plc",
    r"\bllp\b": "llp",
    r"\bltd\b": "ltd",
    r"\bplc\b": "plc",
}

def _normalise(name: str) -> str:
    """Lowercase, strip accents, collapse punctuation, normalise legal suffixes."""
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    name = name.lower().strip()
    name = re.sub(r"[^a-z0-9 ]", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    for pattern, repl in _SUFFIX_MAP.items():
        name = re.sub(pattern, repl, name)
    return name


def _fuzzy_score(query: str, candidate: str) -> float:
    """Return 0–100 WRatio score (token-order invariant)."""
    return fuzz.WRatio(_normalise(query), _normalise(candidate))


# ── Companies House helpers ────────────────────────────────────────────────────

def _ch_auth() -> tuple[str, str] | None:
    """Return (user, password) for CH Basic Auth, or None if no key configured."""
    return (CH_API_KEY, "") if CH_API_KEY else None


async def _ch_search(name: str) -> list[dict[str, Any]]:
    """Call CH search endpoint, return raw items list."""
    auth = _ch_auth()
    if not auth:
        return []
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            CH_SEARCH_URL,
            params={"q": name, "items_per_page": 5},
            auth=auth,
        )
        if resp.status_code == 429:
            raise HTTPException(status_code=429, detail="Companies House rate limit hit")
        if resp.status_code != 200:
            logger.warning("CH search returned %s for %r", resp.status_code, name)
            return []
        return resp.json().get("items", [])


async def _ch_profile(number: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            CH_PROFILE_URL.format(number=number),
            auth=_ch_auth(),
        )
        if resp.status_code == 429:
            raise HTTPException(status_code=429, detail="Companies House rate limit hit")
        return resp.json() if resp.status_code == 200 else {}


async def _ch_filing_history(number: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            CH_FILING_URL.format(number=number),
            params={"category": "accounts", "items_per_page": 1},
            auth=_ch_auth(),
        )
        return resp.json() if resp.status_code == 200 else {}


def _build_ch_record(fingerprint: str, item: dict, profile: dict, filing: dict, score: float) -> CompaniesHouseRecord:
    """Map raw CH API dicts onto our output model."""
    addr_parts = []
    addr = profile.get("registered_office_address", {})
    for key in ("address_line_1", "address_line_2", "locality", "postal_code", "country"):
        val = addr.get(key)
        if val:
            addr_parts.append(val)

    last_filed: str | None = None
    filing_items = filing.get("items", [])
    if filing_items:
        last_filed = filing_items[0].get("date")

    return CompaniesHouseRecord(
        fingerprint=fingerprint,
        company_number=profile.get("company_number"),
        company_status=profile.get("company_status"),
        company_type=profile.get("type"),
        incorporation_date=profile.get("date_of_creation"),
        sic_codes=[s["sic_code"] for s in profile.get("sic_codes", []) if isinstance(s, dict)],
        registered_address=", ".join(addr_parts) or None,
        last_filed_accounts_date=last_filed,
        next_conf_stmt_due_date=profile.get("confirmation_statement", {}).get("next_due"),
        dissolved_at=profile.get("date_of_cessation"),
        historical_names=[n.get("name", "") for n in profile.get("previous_company_names", [])],
        companies_house_source=True,
        fuzzy_match_score=round(score / 100, 3),
        scraped_at=datetime.utcnow().isoformat(),
    )


# ── Cloudflare / CAPTCHA detection ────────────────────────────────────────────

def _is_cf_blocked(html: str) -> bool:
    return any(marker.lower() in html.lower() for marker in CF_MARKERS)


# ── Crawl4AI stealth fetch (fallback) ─────────────────────────────────────────

async def _stealth_fetch(url: str, wait_for: str = "body") -> str:
    """
    Fetch a JS-rendered page via Crawl4AI + camoufox.
    Raises HTTPException 503 if Cloudflare Turnstile is detected.
    """
    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
        from crawl4ai.extraction_strategy import NoExtractionStrategy
    except ImportError:
        raise HTTPException(status_code=503, detail="crawl4ai not installed")

    browser_cfg = BrowserConfig(
        browser_type="firefox",          # camoufox backend
        headless=True,
        user_agent=random.choice(USER_AGENTS),
        extra_args=["--disable-blink-features=AutomationControlled"],
    )
    run_cfg = CrawlerRunConfig(
        wait_for=wait_for,
        page_timeout=30_000,
        extraction_strategy=NoExtractionStrategy(),
    )

    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        result = await crawler.arun(url=url, config=run_cfg)

    html = result.html or ""
    if _is_cf_blocked(html):
        raise HTTPException(status_code=503, detail="Cloudflare Turnstile detected — queue paused")
    return html


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/companies-house", response_model=dict)
async def enrich_companies_house(req: EnrichRequest) -> dict:
    """
    Fetch Companies House data for a sponsor.

    Strategy:
      1. Call CH REST API (if COMPANIES_HOUSE_API_KEY is set).
      2. Fuzzy-match the top-5 results against the sponsor name.
      3. If best score < FUZZY_ACCEPT threshold → 404 (no_match).
      4. If API key absent, attempt stealth scrape of CH web search as fallback.
    """
    company_name = req.company_name

    # ── Path A: Official API ───────────────────────────────────────────────────
    if CH_API_KEY:
        candidates = await _ch_search(company_name)
        if candidates:
            # Score each candidate
            scored = [
                (item, _fuzzy_score(company_name, item.get("title", "")))
                for item in candidates
            ]
            scored.sort(key=lambda x: x[1], reverse=True)
            best_item, best_score = scored[0]

            if best_score < FUZZY_FLAG:
                raise HTTPException(status_code=404, detail=f"No confident CH match (best score={best_score:.0f})")

            number = best_item.get("company_number", "")
            profile, filing = await asyncio.gather(
                _ch_profile(number),
                _ch_filing_history(number),
            )
            record = _build_ch_record(req.fingerprint, best_item, profile, filing, best_score)

            # Flag medium-confidence matches for human review
            if best_score < FUZZY_ACCEPT:
                logger.info(
                    "Medium-confidence CH match for %r: %r (score=%s)",
                    company_name, best_item.get("title"), best_score,
                )
            return {"data": record.model_dump()}

    # ── Path B: Stealth fallback (no API key or zero CH results) ──────────────
    logger.info("No CH API key or zero results — attempting stealth fetch for %r", company_name)
    search_url = f"https://find-and-update.company-information.service.gov.uk/search?{urlencode({'q': company_name})}"
    try:
        html = await _stealth_fetch(search_url, wait_for=".search-results")
    except HTTPException:
        raise  # propagate 503 / 429 as-is

    # Minimal extraction: pull first company number from href pattern
    match = re.search(r"/company/([A-Z0-9]{8})", html)
    if not match:
        raise HTTPException(status_code=404, detail="No CH match found via stealth fetch")

    number = match.group(1)
    profile, filing = await asyncio.gather(
        _ch_profile(number),
        _ch_filing_history(number),
    )
    if not profile:
        raise HTTPException(status_code=404, detail="CH profile fetch failed after stealth number extraction")

    record = _build_ch_record(
        req.fingerprint,
        {"title": profile.get("company_name", company_name), "company_number": number},
        profile,
        filing,
        score=_fuzzy_score(company_name, profile.get("company_name", "")),
    )
    return {"data": record.model_dump()}


@router.post("/licence-history", response_model=dict)
async def enrich_licence_history(req: EnrichRequest) -> dict:
    """
    Scrape historical licence timeline from licensed-sponsors-uk.com.

    Returns a list of LicenceHistoryRecord objects.
    Raises 503 immediately on Cloudflare Turnstile detection so the Node
    orchestrator can pause the BullMQ queue for 5 minutes.
    """
    # Construct the LSUK slug from the company name:
    # e.g. "Acme Technologies Ltd" → "acme-technologies-ltd"
    slug = re.sub(r"[^a-z0-9]+", "-", req.company_name.lower()).strip("-")
    target_url = f"{LSUK_BASE_URL}/sponsor/{slug}"

    html = await _stealth_fetch(target_url, wait_for=".timeline, table, .history")

    records = _parse_lsuk_timeline(req.fingerprint, html, req.company_name)

    if not records:
        # Could be a slug mismatch — return empty list rather than 404
        # so the orchestrator marks the job completed (not failed)
        logger.info("No timeline rows parsed for %r at %s", req.company_name, target_url)
        return {"data": [], "warning": "No timeline rows found; possible slug mismatch"}

    return {"data": [r.model_dump() for r in records]}


# ── LSUK HTML Parser ──────────────────────────────────────────────────────────

def _parse_lsuk_timeline(fingerprint: str, html: str, org_name: str) -> list[LicenceHistoryRecord]:
    """
    Parse the historical licence table from licensed-sponsors-uk.com HTML.

    The page typically renders a <table> with columns:
      Date | Status | Route | Rating | Organisation Name

    We do a best-effort CSS/regex parse without BeautifulSoup to avoid an
    extra dependency (lxml is already in requirements for PyMuPDF).
    """
    from html.parser import HTMLParser

    class TableParser(HTMLParser):
        def __init__(self):
            super().__init__()
            self.rows: list[list[str]] = []
            self._in_td = False
            self._in_th = False
            self._current_row: list[str] = []
            self._cell_buf = ""

        def handle_starttag(self, tag, attrs):
            if tag == "tr":
                self._current_row = []
            elif tag in ("td", "th"):
                self._in_td = True
                self._cell_buf = ""

        def handle_endtag(self, tag):
            if tag in ("td", "th"):
                self._current_row.append(self._cell_buf.strip())
                self._in_td = False
                self._cell_buf = ""
            elif tag == "tr" and self._current_row:
                self.rows.append(self._current_row)
                self._current_row = []

        def handle_data(self, data):
            if self._in_td:
                self._cell_buf += data

    parser = TableParser()
    parser.feed(html)

    # Identify header row to map columns dynamically
    header_map: dict[str, int] = {}
    data_rows: list[list[str]] = []
    for row in parser.rows:
        if not row:
            continue
        if not header_map:
            for i, cell in enumerate(row):
                key = cell.lower().strip()
                if "date" in key:
                    header_map["date"] = i
                elif "status" in key:
                    header_map["status"] = i
                elif "route" in key:
                    header_map["route"] = i
                elif "rating" in key or "type" in key:
                    header_map["rating"] = i
                elif "organisation" in key or "name" in key:
                    header_map["name"] = i
            if header_map:
                continue  # skip the header row itself
        else:
            data_rows.append(row)

    now_iso = datetime.utcnow().isoformat()
    records: list[LicenceHistoryRecord] = []

    for row in data_rows:
        def _cell(key: str) -> str | None:
            idx = header_map.get(key)
            if idx is None or idx >= len(row):
                return None
            val = row[idx].strip()
            return val if val else None

        recorded_date = _cell("date") or ""
        # Normalise date formats: DD/MM/YYYY → YYYY-MM-DD
        date_match = re.match(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})", recorded_date)
        if date_match:
            d, m, y = date_match.groups()
            recorded_date = f"{y}-{int(m):02d}-{int(d):02d}"
        elif not re.match(r"\d{4}-\d{2}-\d{2}", recorded_date):
            continue  # skip unparseable date rows

        records.append(
            LicenceHistoryRecord(
                fingerprint=fingerprint,
                recorded_date=recorded_date,
                licence_status=_cell("status") or "Unknown",
                route=_cell("route"),
                type_rating=_cell("rating"),
                organisation_name=_cell("name") or org_name,
                source="lsuk-scrape",
                scraped_at=now_iso,
            )
        )

    return records
