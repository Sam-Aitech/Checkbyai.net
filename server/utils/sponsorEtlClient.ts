import { db } from "../db";
import { sponsorStaging } from "@shared/schema";
import { generateFingerprint } from "./sponsorListFetcher";
import { logger } from "./logger";

const ETL_BASE_URL = process.env.ETL_SERVICE_URL || "http://localhost:8000";
const PAGE_LIMIT = 5000;

interface EtlRefreshResponse {
  snapshot_id: string;
  snapshot_date: string;
  status: string;
}

interface EtlSponsorRow {
  organisation_name: string;
  town_city?: string;
  county?: string;
  type_rating?: string;
  route?: string;
  snapshot_date: string;
}

interface EtlPageResponse {
  snapshot_id: string;
  page: number;
  limit: number;
  total_rows: number;
  rows: EtlSponsorRow[];
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 60_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function runEtlIngestion(today: string): Promise<{ snapshotId: string; totalRows: number }> {
  logger.info({ today }, "[EtlClient] Triggering ETL pipeline refresh");

  const refreshRes = await fetchWithTimeout(
    `${ETL_BASE_URL}/api/v1/sponsors/refresh`,
    { method: "POST", headers: { "Content-Type": "application/json" } },
    30_000
  );

  if (!refreshRes.ok) {
    const body = await refreshRes.text().catch(() => "");
    throw new Error(`ETL refresh failed: HTTP ${refreshRes.status} — ${body.slice(0, 200)}`);
  }

  const refreshData = await refreshRes.json() as EtlRefreshResponse;
  const snapshotId = refreshData.snapshot_id;

  if (!snapshotId) {
    throw new Error("ETL refresh response missing snapshot_id");
  }

  logger.info({ snapshotId }, "[EtlClient] Fetching pages");

  let page = 1;
  let totalRows = 0;
  let globalRowNum = 0;

  while (true) {
    const url = `${ETL_BASE_URL}/api/v1/sponsors?snapshot_id=${encodeURIComponent(snapshotId)}&page=${page}&limit=${PAGE_LIMIT}`;
    const pageRes = await fetchWithTimeout(url, {}, 60_000);

    if (!pageRes.ok) {
      const body = await pageRes.text().catch(() => "");
      throw new Error(`ETL page fetch failed (page=${page}): HTTP ${pageRes.status} — ${body.slice(0, 200)}`);
    }

    const pageData = await pageRes.json() as EtlPageResponse;

    if (!pageData.rows || pageData.rows.length === 0) {
      break;
    }

    const stagingRows = pageData.rows.map((r, i) => ({
      snapshotId,
      rowNum: globalRowNum + i + 1,
      organisationName: r.organisation_name,
      townCity: r.town_city ?? null,
      county: r.county ?? null,
      typeRating: r.type_rating ?? null,
      route: r.route ?? null,
      fingerprint: generateFingerprint(r.organisation_name, r.town_city ?? "", r.route ?? ""),
      snapshotDate: r.snapshot_date || today,
    }));

    await db.insert(sponsorStaging).values(stagingRows).onConflictDoNothing();

    globalRowNum += pageData.rows.length;
    totalRows += pageData.rows.length;

    logger.info(
      { page, insertedRows: pageData.rows.length, totalRows },
      "[EtlClient] Page ingested",
    );

    if (pageData.rows.length < PAGE_LIMIT) {
      break;
    }

    page++;
  }

  logger.info({ totalRows, snapshotId }, "[EtlClient] Ingestion complete");
  return { snapshotId, totalRows };
}
