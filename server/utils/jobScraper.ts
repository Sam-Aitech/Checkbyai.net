import type { EnrichmentResult } from "./companyEnricher";

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

export interface ScrapedJob {
  title: string;
  location: string;
  salary: string;
  source_board: string;
  source_url: string;
  content_hash: string;
}

export interface ScrapeJobsResult {
  jobs: ScrapedJob[];
  boards_attempted: string[];
  boards_failed: string[];
  error?: string;
}

/**
 * Calls the Python Scrapling backend to scrape job boards for a company.
 * Board list for Pro plan: company, linkedin, indeed, cvlibrary, google
 * Fails silently — returns empty result if Python backend is down.
 */
export async function scrapeJobsForCompany(
  fingerprint: string,
  companyName: string,
  location: string,
  enrichment: EnrichmentResult | null,
  boards = ["company", "linkedin", "indeed", "cvlibrary", "google"],
): Promise<ScrapeJobsResult> {
  const empty: ScrapeJobsResult = { jobs: [], boards_attempted: [], boards_failed: boards };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000); // 60s total timeout

    const res = await fetch(`${PYTHON_BACKEND_URL}/api/scrape-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_name: companyName,
        location,
        fingerprint,
        boards,
        website_url: enrichment?.websiteUrl ?? null,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.error(`[JobScraper] Python backend returned ${res.status} for "${companyName}"`);
      return empty;
    }

    const data: ScrapeJobsResult = await res.json();
    console.log(
      `[JobScraper] "${companyName}" → ${data.jobs.length} jobs from boards: ${data.boards_attempted.join(", ")}`,
      data.boards_failed.length ? `(failed: ${data.boards_failed.join(", ")})` : "",
    );
    return data;
  } catch (err: any) {
    console.error(`[JobScraper] Scrape failed for "${companyName}":`, err.message);
    return empty;
  }
}
