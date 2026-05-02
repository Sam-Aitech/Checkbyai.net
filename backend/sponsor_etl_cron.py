"""
sponsor_etl_cron.py — Standalone UK Gov Sponsor Register ETL (direct Postgres)
===============================================================================
Replaces the retired sponsor_etl.py FastAPI router which staged data in SQLite
and served it to Node.js over HTTP.

This script runs as a standalone cron job and writes directly to the PostgreSQL
`sponsor_canonical` table — the same table that Node.js reads and writes.

Architecture
------------
  1. Discover the CSV URL via find_csv_url.py (Scrapling-based scraper).
  2. Stream-download and cp1252-decode the CSV on the fly (no full-file buffer).
  3. Normalise company names and generate fingerprints (same algorithm as
     server/utils/sponsorListFetcher.ts: lowercase → strip non-alnum-space →
     collapse whitespace → SHA-256[:16]).
  4. Upsert each row into sponsor_canonical:
       - New fingerprint → INSERT with status='ACTIVE', first_seen=today
       - Existing fingerprint → UPDATE last_seen=today, current_name, town_city,
         type_rating, route; reset consecutive_misses to 0.
  5. After processing all CSV rows, mark sponsors not seen today as missed
     (increment consecutive_misses). Sponsors reaching GRACE_PERIOD_THRESHOLD
     consecutive misses transition to status='REMOVED_REVOKED'.

Usage
-----
  python backend/sponsor_etl_cron.py

  Or via system cron (example — daily at 02:00 UTC):
    0 2 * * * /usr/bin/python3 /app/backend/sponsor_etl_cron.py >> /var/log/sponsor_etl.log 2>&1

Environment variables
---------------------
  DATABASE_URL   — PostgreSQL connection string (required)
                   e.g. postgresql://user:pass@host:5432/dbname
                   Neon: use the non-pooled URL for long-running scripts.

Dependencies
------------
  psycopg2-binary>=2.9   (add to requirements.txt / pyproject.toml)
  requests>=2.33.0       (already in requirements.txt)
  find_csv_url           (backend/find_csv_url.py — Scrapling-based URL discovery)

Notes
-----
  • This script is idempotent — safe to run multiple times on the same day.
  • The Node.js sponsorMonitorJob.ts remains the authoritative production ETL;
    this script is provided for Python-native deployment environments.
  • consecutive_misses logic mirrors sponsorStateMachine.ts (server/utils/).
    For status transitions (notifications, digest) use the Node.js job.
"""

import csv
import hashlib
import io
import os
import re
import sys
from datetime import date, datetime, timezone
from typing import Optional

import requests

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    sys.exit(
        "psycopg2-binary is required. Install with: pip install psycopg2-binary"
    )

try:
    from find_csv_url import get_csv_url
except ImportError:
    sys.exit(
        "find_csv_url module not found. Ensure backend/find_csv_url.py is present "
        "and Scrapling is installed."
    )


# ── Constants ──────────────────────────────────────────────────────────────────

GOV_UK_USER_AGENT = (
    "Mozilla/5.0 (compatible; CheckByAI-SponsorBot/1.0; +https://checkbyai.net)"
)
BATCH_SIZE = 500        # rows per INSERT batch
# Sponsors missing from the register for this many consecutive runs transition
# to REMOVED_REVOKED.  Mirrors GRACE_PERIOD_THRESHOLD in sponsorStateMachine.ts.
GRACE_PERIOD_THRESHOLD = 3


# ── Fingerprint helpers (mirrors sponsorListFetcher.ts) ──────────────────────

_NON_ALNUM_SPACE = re.compile(r"[^a-z0-9 ]")
_MULTI_SPACE     = re.compile(r" {2,}")


def normalize_name(name: str) -> str:
    """Lowercase, strip non-alphanumeric-space chars, collapse whitespace."""
    s = name.lower()
    s = _NON_ALNUM_SPACE.sub("", s)
    s = _MULTI_SPACE.sub(" ", s).strip()
    return s


def generate_fingerprint(name: str) -> str:
    """SHA-256 of the normalized name; first 16 hex characters."""
    digest = hashlib.sha256(normalize_name(name).encode("utf-8")).hexdigest()
    return digest[:16]


# ── CSV streaming ─────────────────────────────────────────────────────────────

def stream_csv_rows(csv_url: str):
    """
    Yields dicts for each valid row in the Gov.uk sponsor register CSV.
    Streams + decodes cp1252 on the fly — no full-file buffer.
    """
    resp = requests.get(
        csv_url,
        stream=True,
        timeout=120,
        headers={"User-Agent": GOV_UK_USER_AGENT},
    )
    resp.raise_for_status()

    resp.raw.decode_content = True
    text_stream = io.TextIOWrapper(
        io.BufferedReader(resp.raw),
        encoding="cp1252",
        errors="replace",
        newline="",
    )

    reader = csv.DictReader(text_stream)
    if reader.fieldnames is None:
        raise RuntimeError("CSV appears to be empty (no header row).")

    # Strip cp1252-decoded UTF-8 BOM artefact from first header column.
    fieldnames = list(reader.fieldnames)
    if fieldnames[0].startswith("\xef\xbb\xbf") or fieldnames[0].startswith("ï»¿"):
        fieldnames[0] = fieldnames[0][3:]
        reader.fieldnames = fieldnames

    for raw in reader:
        company_name = raw.get("Organisation Name", "").strip()
        if not company_name:
            continue
        yield {
            "company_name": company_name,
            "town_city":    raw.get("Town/City", "").strip(),
            "type_rating":  raw.get("Type & Rating", "").strip(),
            "route":        raw.get("Route", "").strip(),
        }


# ── Postgres upsert ───────────────────────────────────────────────────────────

_UPSERT_SQL = """
INSERT INTO sponsor_canonical
    (fingerprint, current_name, town_city, type_rating, route,
     status, first_seen, last_seen, granted_at, consecutive_misses)
VALUES %s
ON CONFLICT (fingerprint) DO UPDATE SET
    current_name        = EXCLUDED.current_name,
    town_city           = EXCLUDED.town_city,
    type_rating         = EXCLUDED.type_rating,
    route               = EXCLUDED.route,
    last_seen           = EXCLUDED.last_seen,
    consecutive_misses  = 0,
    status              = CASE
        WHEN sponsor_canonical.status = 'REMOVED_REVOKED' THEN 'NEWLY_GRANTED'
        WHEN sponsor_canonical.status = 'GRACE_PERIOD'    THEN 'ACTIVE'
        ELSE sponsor_canonical.status
    END
"""

_MARK_MISSED_SQL = """
UPDATE sponsor_canonical
SET
    consecutive_misses = consecutive_misses + 1,
    status = CASE
        WHEN consecutive_misses + 1 >= %(threshold)s THEN 'REMOVED_REVOKED'
        WHEN consecutive_misses + 1 >= 1             THEN 'GRACE_PERIOD'
        ELSE status
    END
WHERE last_seen < %(today)s
  AND status NOT IN ('REMOVED_REVOKED')
"""


def run_etl(conn) -> dict:
    """
    Full ETL pass.  Returns a summary dict with counts.
    """
    today = date.today().isoformat()
    now_ts = datetime.now(timezone.utc)

    print(f"[SponsorETLCron] Starting ETL run for {today}")

    # ── Step 1: Discover CSV URL ──────────────────────────────────────────────
    print("[SponsorETLCron] Discovering CSV URL …")
    csv_url = get_csv_url()
    print(f"[SponsorETLCron] CSV URL: {csv_url}")

    # ── Steps 2-4: Stream CSV and upsert to Postgres ──────────────────────────
    cur = conn.cursor()
    batch: list[tuple] = []
    total_rows = 0
    upserted = 0

    for row in stream_csv_rows(csv_url):
        fp = generate_fingerprint(row["company_name"])
        batch.append((
            fp,
            row["company_name"],
            row["town_city"] or None,
            row["type_rating"] or None,
            row["route"] or None,
            "ACTIVE",     # default status for new rows
            today,        # first_seen
            today,        # last_seen
            today,        # granted_at (best-effort: date first inserted)
            0,            # consecutive_misses
        ))
        total_rows += 1

        if len(batch) >= BATCH_SIZE:
            psycopg2.extras.execute_values(cur, _UPSERT_SQL, batch)
            upserted += len(batch)
            batch.clear()
            print(f"[SponsorETLCron]   … {total_rows} rows processed", end="\r")

    if batch:
        psycopg2.extras.execute_values(cur, _UPSERT_SQL, batch)
        upserted += len(batch)

    print(f"\n[SponsorETLCron] Upserted {upserted} rows into sponsor_canonical.")

    if total_rows == 0:
        raise RuntimeError(
            "CSV parsed but contained no valid rows "
            "(all rows had an empty Organisation Name)."
        )

    # ── Step 5: Mark missing sponsors ────────────────────────────────────────
    cur.execute(
        _MARK_MISSED_SQL,
        {"threshold": GRACE_PERIOD_THRESHOLD, "today": today},
    )
    missed = cur.rowcount
    print(f"[SponsorETLCron] Marked {missed} sponsors as missed/removed.")

    conn.commit()
    cur.close()

    return {
        "date": today,
        "total_csv_rows": total_rows,
        "upserted": upserted,
        "missed_incremented": missed,
    }


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    database_url: Optional[str] = os.environ.get("DATABASE_URL")
    if not database_url:
        sys.exit("[SponsorETLCron] ERROR: DATABASE_URL environment variable is not set.")

    try:
        conn = psycopg2.connect(database_url)
    except psycopg2.OperationalError as exc:
        sys.exit(f"[SponsorETLCron] ERROR: Cannot connect to Postgres: {exc}")

    try:
        summary = run_etl(conn)
        print(
            f"[SponsorETLCron] Done. "
            f"{summary['total_csv_rows']} CSV rows → "
            f"{summary['upserted']} upserted, "
            f"{summary['missed_incremented']} marked missed."
        )
    except Exception as exc:
        conn.rollback()
        print(f"[SponsorETLCron] FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
