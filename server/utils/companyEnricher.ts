import { db } from "../db";
import { sponsorEnrichment } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger";

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
const CACHE_TTL_DAYS = 7;
const RATE_LIMIT_MS = 2000; // 1 req per 2s to Companies House

let _lastChFetch = 0;

export interface EnrichmentResult {
  fingerprint: string;
  companyNumber: string | null;
  natureOfBusiness: string | null;
  registeredAddress: string | null;
  websiteUrl: string | null;
}

/**
 * Returns cached enrichment for a fingerprint, or triggers a new scrape.
 * - Cache TTL: 7 days
 * - Companies House: scraped by the Python backend (Scrapling Fetcher)
 * - Fails silently: never blocks the notification dispatch
 */
export async function getOrFetchEnrichment(
  fingerprint: string,
  companyName: string,
): Promise<EnrichmentResult | null> {
  try {
    // Check cache
    const [existing] = await db
      .select()
      .from(sponsorEnrichment)
      .where(eq(sponsorEnrichment.fingerprint, fingerprint))
      .limit(1);

    if (existing) {
      const ageMs = Date.now() - new Date(existing.scrapedAt!).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays < CACHE_TTL_DAYS && existing.scrapeStatus === "success") {
        return {
          fingerprint,
          companyNumber: existing.companyNumber,
          natureOfBusiness: existing.natureOfBusiness,
          registeredAddress: existing.registeredAddress,
          websiteUrl: existing.websiteUrl,
        };
      }
    }

    // Respect rate limit
    const now = Date.now();
    const wait = _lastChFetch + RATE_LIMIT_MS - now;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    _lastChFetch = Date.now();

    // Ask Python backend to scrape Companies House
    const result = await scrapeCompaniesHouse(companyName);

    // Upsert into cache
    await db
      .insert(sponsorEnrichment)
      .values({
        fingerprint,
        companyNumber: result?.companyNumber ?? null,
        natureOfBusiness: result?.natureOfBusiness ?? null,
        registeredAddress: result?.registeredAddress ?? null,
        websiteUrl: result?.websiteUrl ?? null,
        scrapeStatus: result ? "success" : "not_found",
        lastAttempted: new Date(),
        scrapedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: sponsorEnrichment.fingerprint,
        set: {
          companyNumber: result?.companyNumber ?? null,
          natureOfBusiness: result?.natureOfBusiness ?? null,
          registeredAddress: result?.registeredAddress ?? null,
          websiteUrl: result?.websiteUrl ?? null,
          scrapeStatus: result ? "success" : "not_found",
          lastAttempted: new Date(),
          scrapedAt: new Date(),
        },
      });

    if (!result) return null;
    return { fingerprint, ...result };
  } catch (err) {
    logger.error({ err }, `[CompanyEnricher] Failed for "${companyName}":`);
    return null;
  }
}

/**
 * Calls the Python FastAPI backend to scrape Companies House.
 * Python backend handles the actual Scrapling HTTP fetch + cheerio parsing.
 */
async function scrapeCompaniesHouse(companyName: string): Promise<{
  companyNumber: string | null;
  natureOfBusiness: string | null;
  registeredAddress: string | null;
  websiteUrl: string | null;
} | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(`${PYTHON_BACKEND_URL}/api/v1/enrich/companies-house`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_name: companyName }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      companyNumber: data.company_number ?? null,
      natureOfBusiness: data.nature_of_business ?? null,
      registeredAddress: data.registered_address ?? null,
      websiteUrl: data.website_url ?? null,
    };
  } catch (err) {
    logger.warn({ err }, `[CompanyEnricher] Python scrape call failed:`);
    return null;
  }
}
