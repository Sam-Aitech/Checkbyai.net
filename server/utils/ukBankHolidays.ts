import { logger } from "./logger";

const log = logger.child({ module: "UkBankHolidays" });

const GOV_UK_BANK_HOLIDAYS_URL = "https://www.gov.uk/bank-holidays.json";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface BankHolidaysResponse {
  "england-and-wales": { events: { date: string }[] };
}

let cachedDates: Set<string> | null = null;
let cachedAt = 0;

/**
 * Fetches England & Wales bank holiday dates from the GOV.UK public API,
 * caching in-process for 7 days. Fails open to the last known-good set (or
 * empty on first failure) — a GOV.UK outage must never block the real
 * sponsor-monitor cron or make a health check throw.
 */
export async function getBankHolidayDates(): Promise<Set<string>> {
  if (cachedDates && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedDates;
  }
  try {
    const res = await fetch(GOV_UK_BANK_HOLIDAYS_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`GOV.UK bank-holidays.json returned ${res.status}`);
    const data = (await res.json()) as BankHolidaysResponse;
    const dates = new Set(data["england-and-wales"].events.map((e) => e.date));
    cachedDates = dates;
    cachedAt = Date.now();
    return dates;
  } catch (err) {
    log.warn({ err }, "[UkBankHolidays] Fetch failed — using last known set (or empty).");
    return cachedDates ?? new Set();
  }
}

function isWeekendDate(dateStr: string): boolean {
  const day = new Date(dateStr + "T12:00:00Z").getUTCDay();
  return day === 0 || day === 6;
}

/** True if `dateStr` (YYYY-MM-DD) is a weekday and not an England & Wales bank holiday. */
export async function isExpectedPublishDay(dateStr: string): Promise<boolean> {
  if (isWeekendDate(dateStr)) return false;
  const holidays = await getBankHolidayDates();
  return !holidays.has(dateStr);
}

/**
 * Counts expected-publish days strictly after `lastRunDateStr` up to and
 * including today. Lets callers tell a genuine multi-day outage apart from
 * an ordinary weekend/bank-holiday gap when deciding whether data is stale.
 */
export async function countMissedExpectedPublishDays(lastRunDateStr: string): Promise<number> {
  const last = new Date(lastRunDateStr + "T00:00:00Z");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let missed = 0;
  const cursor = new Date(last);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= today) {
    const dateStr = cursor.toISOString().split("T")[0];
    if (await isExpectedPublishDay(dateStr)) missed++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return missed;
}
