"""
Sponsor Licence ETL Agent — FastAPI Microservice
Fetches, parses, and serves the UK Gov daily CSV of Licensed Sponsors.
"""

import csv
import io
import logging
import re
from datetime import datetime, timezone
from typing import Optional

import httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
import uvicorn

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Sponsor Licence ETL Agent",
    description="Streams, parses, and cleans the UK Gov Sponsor Licence CSV.",
    version="1.0.0",
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
GOV_UK_PAGE = (
    "https://www.gov.uk/government/publications/"
    "register-of-licensed-sponsors-workers"
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
}

# Gov.uk CSVs are reliably Windows-1252 encoded
CSV_ENCODING = "cp1252"

# Column name mapping: Gov.uk header → clean field name
COLUMN_MAP = {
    "Organisation Name": "company_name",
    "Town/City": "town",
    "County": "county",
    "Type & Rating": "tier_rating",
    "Route": "visa_route",
}

# ---------------------------------------------------------------------------
# Task 2 — Dynamic link scraper
# ---------------------------------------------------------------------------

def scrape_csv_url() -> str:
    """
    Scrapes the Gov.uk publications page and returns the direct CSV download URL.
    Raises RuntimeError if no CSV link is found.
    """
    log.info("Scraping Gov.uk page for CSV link: %s", GOV_UK_PAGE)

    with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=30) as client:
        response = client.get(GOV_UK_PAGE)
        response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    # Strategy 1: anchor whose visible text contains "Download CSV" / "CSV"
    for tag in soup.find_all("a", href=True):
        text = tag.get_text(strip=True)
        href = tag["href"]
        if re.search(r"download\s+csv", text, re.IGNORECASE) or (
            href.lower().endswith(".csv")
        ):
            csv_url = href if href.startswith("http") else f"https://www.gov.uk{href}"
            log.info("Found CSV URL (text match): %s", csv_url)
            return csv_url

    # Strategy 2: any anchor inside an attachment block whose href ends in .csv
    for tag in soup.select("a[href$='.csv']"):
        href = tag["href"]
        csv_url = href if href.startswith("http") else f"https://www.gov.uk{href}"
        log.info("Found CSV URL (href suffix match): %s", csv_url)
        return csv_url

    raise RuntimeError(
        "Could not locate a CSV download link on the Gov.uk page. "
        "The page structure may have changed."
    )


# ---------------------------------------------------------------------------
# Task 3 — Stream download & parse
# ---------------------------------------------------------------------------

def stream_and_parse_csv(csv_url: str, limit: Optional[int]) -> list[dict]:
    """
    Streams the CSV from `csv_url`, decodes it as cp1252, and returns
    a list of cleaned dicts — capped at `limit` rows when provided.
    """
    log.info("Streaming CSV from: %s  (limit=%s)", csv_url, limit)

    rows: list[dict] = []
    scraped_at = datetime.now(timezone.utc).isoformat()

    with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=120) as client:
        with client.stream("GET", csv_url) as response:
            response.raise_for_status()

            # Accumulate raw bytes then decode — safe for 10 MB files on Replit
            raw_bytes = b"".join(response.iter_bytes(chunk_size=65_536))

    log.info("Downloaded %.2f MB", len(raw_bytes) / 1_048_576)

    # Decode with cp1252; replace any unmappable bytes so we never hard-crash
    text = raw_bytes.decode(CSV_ENCODING, errors="replace")

    reader = csv.DictReader(io.StringIO(text))

    for i, row in enumerate(reader):
        if limit is not None and i >= limit:
            break

        # Task 4 — map & clean
        cleaned = {
            clean_key: (row.get(gov_key) or "").strip()
            for gov_key, clean_key in COLUMN_MAP.items()
        }
        cleaned["scraped_at"] = scraped_at
        rows.append(cleaned)

    log.info("Parsed %d rows", len(rows))
    return rows


# ---------------------------------------------------------------------------
# Task 5 — API endpoint
# ---------------------------------------------------------------------------

@app.get(
    "/api/v1/fetch-sponsors",
    summary="Fetch & return cleaned UK Sponsor Licence data",
    tags=["ETL"],
)
async def fetch_sponsors(
    limit: Optional[int] = Query(
        default=None,
        ge=1,
        description="Cap the number of rows returned (omit for full dataset).",
        example=1000,
    )
):
    """
    1. Scrapes Gov.uk for the daily CSV URL.
    2. Streams and downloads the CSV.
    3. Decodes (cp1252), parses, and cleans the data.
    4. Returns a JSON array of sponsor records.
    """
    try:
        csv_url = scrape_csv_url()
    except httpx.HTTPStatusError as exc:
        log.error("HTTP error scraping Gov.uk page: %s", exc)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to load Gov.uk page: HTTP {exc.response.status_code}",
        )
    except Exception as exc:
        log.error("Error scraping Gov.uk page: %s", exc)
        raise HTTPException(status_code=502, detail=f"Scrape error: {exc}")

    try:
        sponsors = stream_and_parse_csv(csv_url, limit=limit)
    except httpx.HTTPStatusError as exc:
        log.error("HTTP error downloading CSV: %s", exc)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to download CSV: HTTP {exc.response.status_code}",
        )
    except Exception as exc:
        log.error("Error parsing CSV: %s", exc)
        raise HTTPException(status_code=500, detail=f"Parse error: {exc}")

    return JSONResponse(
        content={
            "status": "ok",
            "csv_source": csv_url,
            "total_returned": len(sponsors),
            "sponsors": sponsors,
        }
    )


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["Meta"])
async def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Entrypoint (Replit uses `python main.py`)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
