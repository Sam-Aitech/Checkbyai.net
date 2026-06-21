/**
 * Salary sanity check for the Single Scam Check report.
 *
 * Compares the salary stated on a job offer / CoS against UK Skilled Worker
 * visa thresholds. Figures last reviewed June 2026 (changes of 22 July 2025):
 *   - General threshold: £41,700/year (or the SOC going rate if higher)
 *   - Health & Care visa eligible roles: £25,600 floor + going rate
 *   - Care worker / senior care worker (SOC 6135/6136): overseas applications
 *     CLOSED on 22 July 2025 — any "care worker CoS" offered to an applicant
 *     outside the UK is a critical scam signal.
 *
 * Output is indicative guidance, not legal advice; thresholds are surfaced
 * with their review date so stale data is visible.
 */

export const THRESHOLDS = {
  reviewedAt: "2026-06",
  general: 41_700,
  healthCareFloor: 25_600,
  /** Below this no Skilled Worker route plausibly applies. */
  absoluteFloor: 25_600,
} as const;

/**
 * Indicative annual going rates for occupations that appear most often in
 * CoS scam reports. Not exhaustive — absence of a SOC code only skips the
 * going-rate comparison, the general thresholds still apply.
 */
export const INDICATIVE_GOING_RATES: Record<string, { label: string; rate: number; healthCare?: boolean }> = {
  "6135": { label: "Care worker", rate: 25_000, healthCare: true },
  "6136": { label: "Senior care worker", rate: 25_000, healthCare: true },
  "2231": { label: "Registered nurse", rate: 31_000, healthCare: true },
  "5434": { label: "Chef", rate: 36_000 },
  "5433": { label: "Butcher / meat processor", rate: 32_000 },
  "9139": { label: "Warehouse / process operative", rate: 30_000 },
  "2134": { label: "Software developer", rate: 49_400 },
  "3111": { label: "Laboratory technician", rate: 30_000 },
};

const CARE_WORKER_SOCS = new Set(["6135", "6136"]);

export interface SalaryCheckInput {
  /** Annual salary in GBP as stated on the offer/CoS. */
  annualSalaryGbp: number;
  /** 4-digit SOC 2020 code if known (e.g. "6135"). */
  socCode?: string;
  /** Free-text job title — used for care-worker detection when SOC missing. */
  jobTitle?: string;
  /** Is the applicant applying from outside the UK? Defaults true (typical buyer). */
  applyingFromOverseas?: boolean;
}

export interface SalaryCheckFlag {
  name: string;
  passed: boolean;
  severity: "critical" | "high" | "medium" | "info";
  message: string;
}

export interface SalaryCheckResult {
  verdict: "FAIL" | "WARN" | "PASS";
  flags: SalaryCheckFlag[];
  thresholdsReviewedAt: string;
}

function looksLikeCareWorker(jobTitle?: string): boolean {
  if (!jobTitle) return false;
  return /care\s*(assistant|worker|giver)|carer|senior\s*care/i.test(jobTitle);
}

export function checkSalary(input: SalaryCheckInput): SalaryCheckResult {
  const { annualSalaryGbp, socCode, jobTitle } = input;
  const applyingFromOverseas = input.applyingFromOverseas ?? true;
  const flags: SalaryCheckFlag[] = [];

  const normalizedSoc = socCode?.trim().slice(0, 4);
  const goingRate = normalizedSoc ? INDICATIVE_GOING_RATES[normalizedSoc] : undefined;
  const isCareRole =
    (normalizedSoc ? CARE_WORKER_SOCS.has(normalizedSoc) : false) || looksLikeCareWorker(jobTitle);

  // ── Critical: care-worker route closed to overseas applicants ─────────────
  if (isCareRole && applyingFromOverseas) {
    flags.push({
      name: "Care worker route closed",
      passed: false,
      severity: "critical",
      message:
        "The UK closed care worker and senior care worker visa applications from overseas on 22 July 2025. " +
        "Any Certificate of Sponsorship for a care worker role offered to someone outside the UK cannot lead to a visa — " +
        "this is one of the most common CoS scams. Do not pay anything.",
    });
  }

  // ── Absolute floor ─────────────────────────────────────────────────────────
  if (annualSalaryGbp < THRESHOLDS.absoluteFloor) {
    flags.push({
      name: "Below minimum visa salary",
      passed: false,
      severity: "critical",
      message:
        `The stated salary (£${annualSalaryGbp.toLocaleString()}) is below £${THRESHOLDS.absoluteFloor.toLocaleString()}, ` +
        `the lowest salary any Skilled Worker route allows. A visa application with this salary would be refused.`,
    });
  } else if (goingRate && annualSalaryGbp < goingRate.rate) {
    // ── Going-rate comparison for known scam-heavy SOCs ──────────────────────
    flags.push({
      name: "Below going rate for occupation",
      passed: false,
      severity: "high",
      message:
        `The stated salary (£${annualSalaryGbp.toLocaleString()}) is below the indicative going rate for ` +
        `${goingRate.label} (£${goingRate.rate.toLocaleString()}). The Home Office refuses applications paid under the going rate.`,
    });
  }

  // ── General threshold (non health-and-care roles) ──────────────────────────
  const isHealthCare = goingRate?.healthCare || isCareRole;
  if (!isHealthCare && annualSalaryGbp >= THRESHOLDS.absoluteFloor && annualSalaryGbp < THRESHOLDS.general) {
    flags.push({
      name: "Below general salary threshold",
      passed: false,
      severity: "medium",
      message:
        `The stated salary (£${annualSalaryGbp.toLocaleString()}) is below the £${THRESHOLDS.general.toLocaleString()} ` +
        `general Skilled Worker threshold (from 22 July 2025). Unless the role qualifies for a reduced threshold ` +
        `(e.g. Health & Care visa, PhD roles, new entrants), the application would be refused.`,
    });
  }

  if (flags.length === 0) {
    flags.push({
      name: "Salary plausible",
      passed: true,
      severity: "info",
      message:
        `The stated salary (£${annualSalaryGbp.toLocaleString()}) meets the thresholds we can check. ` +
        `This does not guarantee the offer is genuine — verify the sponsor and the document itself.`,
    });
  }

  const verdict = flags.some((f) => f.severity === "critical")
    ? "FAIL"
    : flags.some((f) => !f.passed)
      ? "WARN"
      : "PASS";

  return { verdict, flags, thresholdsReviewedAt: THRESHOLDS.reviewedAt };
}
