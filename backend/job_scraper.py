"""
job_scraper.py — Scrapling-powered job board scraper for CheckByAI
Adds a /api/scrape-jobs endpoint to the existing FastAPI backend.

Boards: company website, LinkedIn, Indeed, CV-Library, Google Jobs
Called from Node.js jobAlertJob.ts via fetch("http://localhost:8000/api/scrape-jobs")
"""

import asyncio
import hashlib
import re
from typing import Optional
from urllib.parse import urlencode, quote_plus

from fastapi import APIRouter
from pydantic import BaseModel

try:
    from scrapling import Fetcher, StealthyFetcher
    SCRAPLING_AVAILABLE = True
except ImportError:
    SCRAPLING_AVAILABLE = False
    print("[JobScraper] WARNING: scrapling not installed — job scraping disabled")

router = APIRouter()

# ─── Request / Response models ───────────────────────────────────────────────

class ScrapeJobsRequest(BaseModel):
    company_name: str
    location: str = "United Kingdom"
    fingerprint: str
    boards: list[str] = ["company", "linkedin", "indeed", "cvlibrary", "google"]
    website_url: Optional[str] = None  # from sponsor_enrichment if known


class JobListing(BaseModel):
    title: str
    location: str = ""
    salary: str = ""
    source_board: str
    source_url: str
    content_hash: str


class ScrapeJobsResponse(BaseModel):
    jobs: list[JobListing]
    boards_attempted: list[str]
    boards_failed: list[str]
    error: Optional[str] = None


# ─── Hash helper ─────────────────────────────────────────────────────────────

def make_hash(fingerprint: str, title: str, location: str, board: str) -> str:
    raw = f"{fingerprint}|{title.lower().strip()}|{location.lower().strip()}|{board}"
    return hashlib.sha256(raw.encode()).hexdigest()


# ─── Board scrapers ──────────────────────────────────────────────────────────

async def scrape_indeed(company: str, location: str, fingerprint: str) -> list[JobListing]:
    """Scrape Indeed UK for recent jobs at company."""
    jobs: list[JobListing] = []
    try:
        q = quote_plus(f'"{company}"')
        url = f"https://www.indeed.co.uk/jobs?q={q}&l=United+Kingdom&sort=date&limit=15"
        page = await asyncio.to_thread(
            Fetcher().get, url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; CheckByAI/1.0)"},
            timeout=15
        )
        if not page:
            return jobs

        for card in (page.css(".job_seen_beacon") or page.css(".jobCard_mainContent") or []):
            title_el = card.css("h2.jobTitle span[title]") or card.css("h2.jobTitle")
            loc_el   = card.css("[data-testid='text-location']") or card.css(".companyLocation")
            link_el  = card.css("a[data-jk]") or card.css("a.jcs-JobTitle")

            title = (title_el[0].text if title_el else "").strip()
            loc   = (loc_el[0].text if loc_el else location).strip()
            href  = link_el[0].attrib.get("href", "") if link_el else ""
            link  = f"https://www.indeed.co.uk{href}" if href.startswith("/") else href

            if not title or company.lower()[:6] not in page.text.lower():
                continue

            jobs.append(JobListing(
                title=title,
                location=loc,
                source_board="indeed",
                source_url=link or url,
                content_hash=make_hash(fingerprint, title, loc, "indeed"),
            ))
    except Exception as e:
        print(f"[JobScraper] Indeed error for '{company}': {e}")
    return jobs[:10]


async def scrape_linkedin(company: str, location: str, fingerprint: str) -> list[JobListing]:
    """Scrape LinkedIn public job search (unauthenticated pages)."""
    jobs: list[JobListing] = []
    try:
        q = quote_plus(company)
        url = (
            f"https://www.linkedin.com/jobs/search/"
            f"?keywords={q}&location=United+Kingdom&sortBy=DD&f_TPR=r86400"
        )
        # Use StealthyFetcher for LinkedIn's bot detection
        page = await asyncio.to_thread(
            StealthyFetcher().get, url,
            timeout=20,
            stealthy_headers=True,
        )
        if not page:
            return jobs

        for card in (page.css(".base-card") or page.css(".job-search-card") or []):
            title_el = card.css(".base-search-card__title") or card.css("h3")
            loc_el   = card.css(".job-search-card__location")
            link_el  = card.css("a.base-card__full-link")

            title = (title_el[0].text if title_el else "").strip()
            loc   = (loc_el[0].text if loc_el else location).strip()
            link  = link_el[0].attrib.get("href", url) if link_el else url

            if not title:
                continue

            jobs.append(JobListing(
                title=title,
                location=loc,
                source_board="linkedin",
                source_url=link,
                content_hash=make_hash(fingerprint, title, loc, "linkedin"),
            ))
    except Exception as e:
        print(f"[JobScraper] LinkedIn error for '{company}': {e}")
    return jobs[:10]


async def scrape_cvlibrary(company: str, location: str, fingerprint: str) -> list[JobListing]:
    """Scrape CV-Library employer search."""
    jobs: list[JobListing] = []
    try:
        q = quote_plus(company)
        url = f"https://www.cv-library.co.uk/search-jobs?q={q}&geo=United+Kingdom&us=1&sort=posted_date"
        page = await asyncio.to_thread(
            Fetcher().get, url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; CheckByAI/1.0)"},
            timeout=15
        )
        if not page:
            return jobs

        for card in (page.css(".job-item") or page.css("[data-job-id]") or []):
            title_el = card.css("h2 a") or card.css(".job-title")
            loc_el   = card.css(".location") or card.css("[data-location]")
            link_el  = card.css("a[href]")

            title = (title_el[0].text if title_el else "").strip()
            loc   = (loc_el[0].text if loc_el else location).strip()
            link  = link_el[0].attrib.get("href", url) if link_el else url
            if link.startswith("/"):
                link = f"https://www.cv-library.co.uk{link}"

            if not title:
                continue

            jobs.append(JobListing(
                title=title,
                location=loc,
                source_board="cvlibrary",
                source_url=link,
                content_hash=make_hash(fingerprint, title, loc, "cvlibrary"),
            ))
    except Exception as e:
        print(f"[JobScraper] CV-Library error for '{company}': {e}")
    return jobs[:10]


async def scrape_google_jobs(company: str, location: str, fingerprint: str) -> list[JobListing]:
    """
    Scrape Google Jobs via structured JSON-LD data in search results.
    Google embeds application/ld+json JobPosting schema directly — no API needed.
    """
    jobs: list[JobListing] = []
    try:
        q = quote_plus(f"{company} jobs UK")
        url = f"https://www.google.co.uk/search?q={q}&tbs=qdr:w&ibp=htl;jobs"
        page = await asyncio.to_thread(
            StealthyFetcher().get, url,
            timeout=20,
            stealthy_headers=True,
        )
        if not page:
            return jobs

        import json as _json

        # Try JSON-LD first (most reliable)
        for script in (page.css("script[type='application/ld+json']") or []):
            try:
                data = _json.loads(script.text or "{}")
                items = data if isinstance(data, list) else [data]
                for item in items:
                    if item.get("@type") != "JobPosting":
                        continue
                    title   = item.get("title", "").strip()
                    loc_obj = item.get("jobLocation", {})
                    loc     = ""
                    if isinstance(loc_obj, dict):
                        addr = loc_obj.get("address", {})
                        loc  = addr.get("addressLocality", "") or addr.get("addressRegion", "")
                    link = item.get("url") or item.get("sameAs") or url
                    if title:
                        jobs.append(JobListing(
                            title=title,
                            location=loc or location,
                            source_board="google",
                            source_url=link,
                            content_hash=make_hash(fingerprint, title, loc, "google"),
                        ))
            except Exception:
                continue

        # Fallback: scrape visible job cards
        if not jobs:
            for card in (page.css("[jscontroller='NMm5M']") or page.css(".gws-plugins-horizon-jobs__tl-lif") or []):
                title_el = card.css("h2") or card.css(".BjJfJf")
                loc_el   = card.css(".vNEEBe") or card.css(".Qk80Jf")
                title = (title_el[0].text if title_el else "").strip()
                loc   = (loc_el[0].text if loc_el else location).strip()
                if title:
                    jobs.append(JobListing(
                        title=title,
                        location=loc,
                        source_board="google",
                        source_url=url,
                        content_hash=make_hash(fingerprint, title, loc, "google"),
                    ))
    except Exception as e:
        print(f"[JobScraper] Google Jobs error for '{company}': {e}")
    return jobs[:10]


async def scrape_company_website(
    company: str,
    location: str,
    fingerprint: str,
    website_url: Optional[str],
) -> list[JobListing]:
    """
    Scrape the company's own careers page.
    Tries /jobs, /careers, /vacancies, /work-with-us paths.
    """
    jobs: list[JobListing] = []
    if not website_url:
        return jobs

    base = website_url.rstrip("/")
    paths = ["/jobs", "/careers", "/vacancies", "/work-with-us", "/join-us", "/opportunities"]

    for path in paths:
        try:
            url = base + path
            page = await asyncio.to_thread(
                Fetcher().get, url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; CheckByAI/1.0)"},
                timeout=12,
            )
            if not page or page.status != 200:
                continue

            text = page.text or ""
            # Quick relevance check — does the page mention jobs?
            job_keywords = ["vacancy", "vacanc", "job", "role", "position", "apply", "career"]
            if not any(kw in text.lower() for kw in job_keywords):
                continue

            # Common patterns for job titles on careers pages
            for el in (
                page.css("h2") + page.css("h3") + page.css(".job-title") +
                page.css("[class*='job']") + page.css("[class*='role']") +
                page.css("[class*='vacanc']") + page.css("li a")
            )[:30]:
                title = el.text.strip() if el.text else ""
                # Filter: must be short enough to be a job title and not nav text
                if 5 < len(title) < 120 and title not in ("home", "about", "contact", "login"):
                    link_el = el if el.tag == "a" else None
                    link    = (link_el.attrib.get("href", "") if link_el else "")
                    if link and not link.startswith("http"):
                        link = base + link
                    jobs.append(JobListing(
                        title=title,
                        location=location,
                        source_board="company",
                        source_url=link or url,
                        content_hash=make_hash(fingerprint, title, location, "company"),
                    ))

            if jobs:
                break  # Found a working careers path
        except Exception as e:
            print(f"[JobScraper] Company website error {base}{path}: {e}")
            continue

    # Deduplicate within company website results by title
    seen_titles: set[str] = set()
    unique: list[JobListing] = []
    for j in jobs:
        if j.title.lower() not in seen_titles:
            seen_titles.add(j.title.lower())
            unique.append(j)

    return unique[:10]


# ─── Main endpoint ────────────────────────────────────────────────────────────

@router.post("/api/scrape-jobs", response_model=ScrapeJobsResponse)
async def scrape_jobs(req: ScrapeJobsRequest) -> ScrapeJobsResponse:
    """
    Scrapes up to 5 job boards for the requested company and returns new listings.
    Called nightly by Node.js jobAlertJob.ts.
    """
    if not SCRAPLING_AVAILABLE:
        return ScrapeJobsResponse(
            jobs=[],
            boards_attempted=[],
            boards_failed=req.boards,
            error="scrapling library not installed",
        )

    board_scrapers = {
        "indeed":    lambda: scrape_indeed(req.company_name, req.location, req.fingerprint),
        "linkedin":  lambda: scrape_linkedin(req.company_name, req.location, req.fingerprint),
        "cvlibrary": lambda: scrape_cvlibrary(req.company_name, req.location, req.fingerprint),
        "google":    lambda: scrape_google_jobs(req.company_name, req.location, req.fingerprint),
        "company":   lambda: scrape_company_website(
            req.company_name, req.location, req.fingerprint, req.website_url
        ),
    }

    attempted: list[str] = []
    failed: list[str]    = []
    all_jobs: list[JobListing] = []

    # Run all allowed boards in parallel
    active_boards = [b for b in req.boards if b in board_scrapers]
    tasks = {board: board_scrapers[board]() for board in active_boards}

    results = await asyncio.gather(*tasks.values(), return_exceptions=True)

    for board, result in zip(tasks.keys(), results):
        attempted.append(board)
        if isinstance(result, Exception):
            print(f"[JobScraper] Board '{board}' raised: {result}")
            failed.append(board)
        else:
            all_jobs.extend(result)

    # Global dedup by content_hash
    seen: set[str] = set()
    unique_jobs: list[JobListing] = []
    for job in all_jobs:
        if job.content_hash not in seen:
            seen.add(job.content_hash)
            unique_jobs.append(job)

    return ScrapeJobsResponse(
        jobs=unique_jobs,
        boards_attempted=attempted,
        boards_failed=failed,
    )
