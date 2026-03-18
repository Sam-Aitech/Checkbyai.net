"""
sponsor_etl.py — UK Gov Sponsor Licence Register ETL microservice
Adds three deterministic, paginated endpoints to the existing FastAPI backend:

  POST /api/v1/sponsors/refresh        — scrape URL, stream CSV, decode cp1252, store in SQLite
  GET  /api/v1/sponsors                — paginated rows for a given snapshot_id
  GET  /api/v1/sponsors/latest         — metadata for the most recent COMPLETE snapshot

The service is READ-ONLY against the main PostgreSQL database.
All state is kept in a local SQLite file (etl_sponsors.db).

Called by the Node.js ingestion worker (Task #2) via internal HTTP on port 8000.
"""

import csv
import io
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from typing import Optional

import requests
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

try:
    from find_csv_url import get_csv_url
    SCRAPLING_AVAILABLE = True
except Exception:
    SCRAPLING_AVAILABLE = False
    print("[SponsorETL] WARNING: find_csv_url import failed — /refresh will return 503")


# ── Constants ─────────────────────────────────────────────────────────────────

SQLITE_PATH = "etl_sponsors.db"
GOV_UK_USER_AGENT = (
    "Mozilla/5.0 (compatible; CheckByAI-SponsorBot/1.0; +https://checkbyai.net)"
)
BATCH_SIZE = 5000
MAX_LIMIT = 5000


# ── SQLite helpers ────────────────────────────────────────────────────────────

_db_lock = threading.Lock()


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(SQLITE_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    """Create tables on first import. Idempotent (uses IF NOT EXISTS)."""
    with _db_lock, _get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS etl_snapshots (
                snapshot_id   TEXT PRIMARY KEY,
                snapshot_date TEXT NOT NULL,
                status        TEXT NOT NULL DEFAULT 'PENDING',
                total_rows    INTEGER,
                scraped_at    TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS etl_rows (
                snapshot_id  TEXT    NOT NULL,
                row_num      INTEGER NOT NULL,
                company_name TEXT    NOT NULL,
                town         TEXT    DEFAULT '',
                county       TEXT    DEFAULT '',
                tier_rating  TEXT    DEFAULT '',
                visa_route   TEXT    DEFAULT '',
                scraped_at   TEXT    NOT NULL,
                PRIMARY KEY (snapshot_id, row_num),
                FOREIGN KEY (snapshot_id) REFERENCES etl_snapshots(snapshot_id)
            );

            CREATE INDEX IF NOT EXISTS idx_etl_rows_snapshot
                ON etl_rows (snapshot_id, row_num);

            CREATE INDEX IF NOT EXISTS idx_etl_snapshots_status_date
                ON etl_snapshots (status, scraped_at DESC);
        """)


_init_db()


# ── Column mapping ────────────────────────────────────────────────────────────

def _map_row(raw: dict, scraped_at: str) -> dict | None:
    """
    Map a raw DictReader row to the clean schema.
    Returns None for rows with an empty company_name (skip them).
    """
    company_name = raw.get("Organisation Name", "").strip()
    if not company_name:
        return None
    return {
        "company_name": company_name,
        "town":         raw.get("Town/City", "").strip(),
        "county":       raw.get("County", "").strip(),
        "tier_rating":  raw.get("Type & Rating", "").strip(),
        "visa_route":   raw.get("Route", "").strip(),
        "scraped_at":   scraped_at,
    }


# ── 5-Step ETL pipeline ───────────────────────────────────────────────────────

def run_etl_pipeline(snapshot_id: str) -> int:
    """
    Synchronous ETL pipeline. Designed to be called in a thread-pool executor
    from the async /refresh endpoint so it does not block the event loop.

    Step 1 — Discover CSV URL via Scrapling (Fetcher → StealthyFetcher).
    Step 2 — Stream download using requests with a 120-second timeout.
    Step 3 — Decode raw bytes as cp1252 with errors='replace' (Gov.uk standard).
    Step 4 — Parse decoded text with csv.DictReader; map column names.
    Step 5 — Bulk-insert mapped rows into SQLite in batches of 5,000.

    Returns total valid rows inserted.
    Raises RuntimeError on any unrecoverable error (caller marks snapshot FAILED).
    """
    scraped_at = datetime.now(timezone.utc).isoformat()

    # ── Step 1: Discover CSV URL ──────────────────────────────────────────────
    if not SCRAPLING_AVAILABLE:
        raise RuntimeError("Scrapling library is not available in this environment.")

    csv_url = get_csv_url()  # raises RuntimeError if not found

    # ── Step 2: Streamed download ─────────────────────────────────────────────
    try:
        resp = requests.get(
            csv_url,
            stream=True,
            timeout=120,
            headers={"User-Agent": GOV_UK_USER_AGENT},
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise RuntimeError(f"CSV download failed: {exc}") from exc

    # ── Step 3: Accumulate and decode as cp1252 ───────────────────────────────
    try:
        raw_bytes = b"".join(resp.iter_content(chunk_size=65_536))
    except Exception as exc:
        raise RuntimeError(f"Error reading CSV response stream: {exc}") from exc

    try:
        # BOM-aware: strip UTF-8/UTF-16 BOM if present; otherwise decode cp1252
        if raw_bytes.startswith(b"\xef\xbb\xbf"):
            text = raw_bytes[3:].decode("utf-8", errors="replace")
        else:
            text = raw_bytes.decode("cp1252", errors="replace")
    except Exception as exc:
        raise RuntimeError(f"CSV decoding failed: {exc}") from exc

    text_stream = io.StringIO(text)

    # ── Step 4: Parse with DictReader ────────────────────────────────────────
    try:
        reader = csv.DictReader(text_stream)
        if reader.fieldnames is None:
            raise RuntimeError("CSV appears to be empty (no header row found).")
    except Exception as exc:
        raise RuntimeError(f"CSV parsing initialisation failed: {exc}") from exc

    # ── Step 5: Bulk-insert into SQLite ──────────────────────────────────────
    _INSERT_SQL = (
        "INSERT OR IGNORE INTO etl_rows "
        "(snapshot_id, row_num, company_name, town, county, tier_rating, visa_route, scraped_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )

    batch: list[tuple] = []
    row_num = 0

    try:
        with _db_lock, _get_conn() as conn:
            for raw in reader:
                mapped = _map_row(raw, scraped_at)
                if mapped is None:
                    continue

                row_num += 1
                batch.append((
                    snapshot_id,
                    row_num,
                    mapped["company_name"],
                    mapped["town"],
                    mapped["county"],
                    mapped["tier_rating"],
                    mapped["visa_route"],
                    mapped["scraped_at"],
                ))

                if len(batch) >= BATCH_SIZE:
                    conn.executemany(_INSERT_SQL, batch)
                    batch.clear()

            if batch:
                conn.executemany(_INSERT_SQL, batch)

            conn.execute(
                "UPDATE etl_snapshots SET status = 'COMPLETE', total_rows = ? "
                "WHERE snapshot_id = ?",
                (row_num, snapshot_id),
            )
    except Exception as exc:
        raise RuntimeError(f"SQLite insert error: {exc}") from exc

    if row_num == 0:
        raise RuntimeError(
            "CSV was parsed but contained no valid rows "
            "(all rows had an empty Organisation Name)."
        )

    return row_num


# ── Pydantic models ───────────────────────────────────────────────────────────

class RefreshResponse(BaseModel):
    snapshot_id: str
    total_rows: int
    scraped_at: str


class SnapshotMeta(BaseModel):
    snapshot_id: str
    snapshot_date: str
    status: str
    total_rows: Optional[int]
    scraped_at: str


class SponsorRow(BaseModel):
    company_name: str
    town: str
    county: str
    tier_rating: str
    visa_route: str
    scraped_at: str


class PagedResponse(BaseModel):
    snapshot_id: str
    page: int
    limit: int
    total_rows: int
    total_pages: int
    rows: list[SponsorRow]


# ── Router ────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/api/v1", tags=["Sponsor ETL"])


@router.post("/sponsors/refresh", response_model=RefreshResponse, status_code=200)
async def refresh_sponsors():
    """
    Trigger a full ETL run.
    Scrapes Gov.uk, streams and decodes the CSV (cp1252), maps columns,
    and persists all rows in local SQLite keyed by a new snapshot_id.

    Returns snapshot metadata once the pipeline completes.
    Use the returned snapshot_id with GET /api/v1/sponsors to page through rows.
    """
    import asyncio

    snapshot_id = str(uuid.uuid4())
    scraped_at = datetime.now(timezone.utc).isoformat()
    today = datetime.now(timezone.utc).date().isoformat()

    with _db_lock, _get_conn() as conn:
        conn.execute(
            "INSERT INTO etl_snapshots (snapshot_id, snapshot_date, status, scraped_at) "
            "VALUES (?, ?, 'PENDING', ?)",
            (snapshot_id, today, scraped_at),
        )

    try:
        loop = asyncio.get_event_loop()
        total_rows = await loop.run_in_executor(None, run_etl_pipeline, snapshot_id)
    except Exception as exc:
        with _db_lock, _get_conn() as conn:
            conn.execute(
                "UPDATE etl_snapshots SET status = 'FAILED' WHERE snapshot_id = ?",
                (snapshot_id,),
            )
        raise HTTPException(
            status_code=503,
            detail=f"ETL pipeline failed: {exc}",
        )

    return RefreshResponse(
        snapshot_id=snapshot_id,
        total_rows=total_rows,
        scraped_at=scraped_at,
    )


@router.get("/sponsors/latest", response_model=SnapshotMeta)
async def get_latest_snapshot():
    """
    Return metadata for the most recently completed ETL snapshot.
    Use the snapshot_id to begin fetching pages from GET /api/v1/sponsors.
    """
    with _db_lock, _get_conn() as conn:
        row = conn.execute(
            "SELECT snapshot_id, snapshot_date, status, total_rows, scraped_at "
            "FROM etl_snapshots "
            "WHERE status = 'COMPLETE' "
            "ORDER BY scraped_at DESC "
            "LIMIT 1"
        ).fetchone()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="No completed snapshots found. Call POST /api/v1/sponsors/refresh first.",
        )

    return SnapshotMeta(**dict(row))


@router.get("/sponsors", response_model=PagedResponse)
async def get_sponsors(
    snapshot_id: str = Query(..., description="snapshot_id from /refresh or /latest"),
    page: int = Query(1, ge=1, description="1-indexed page number"),
    limit: int = Query(5000, ge=1, le=MAX_LIMIT, description=f"Rows per page (max {MAX_LIMIT})"),
):
    """
    Return a page of sponsor rows for the given snapshot_id.
    Pages are 1-indexed. Use total_pages to know when to stop fetching.
    """
    with _db_lock, _get_conn() as conn:
        meta = conn.execute(
            "SELECT total_rows, status FROM etl_snapshots WHERE snapshot_id = ?",
            (snapshot_id,),
        ).fetchone()

        if meta is None:
            raise HTTPException(
                status_code=404,
                detail=f"Snapshot '{snapshot_id}' not found.",
            )

        if meta["status"] != "COMPLETE":
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Snapshot '{snapshot_id}' is not ready "
                    f"(status: {meta['status']}). Try again shortly."
                ),
            )

        total_rows: int = meta["total_rows"] or 0
        total_pages = max(1, (total_rows + limit - 1) // limit)
        offset = (page - 1) * limit

        rows = conn.execute(
            "SELECT company_name, town, county, tier_rating, visa_route, scraped_at "
            "FROM etl_rows "
            "WHERE snapshot_id = ? "
            "ORDER BY row_num "
            "LIMIT ? OFFSET ?",
            (snapshot_id, limit, offset),
        ).fetchall()

    return PagedResponse(
        snapshot_id=snapshot_id,
        page=page,
        limit=limit,
        total_rows=total_rows,
        total_pages=total_pages,
        rows=[SponsorRow(**dict(r)) for r in rows],
    )
