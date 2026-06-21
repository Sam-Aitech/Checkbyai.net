/**
 * salaryCheck.test.ts — Skilled Worker salary threshold logic for the
 * Single Scam Check report. Thresholds as of 22 July 2025 changes.
 */
import { describe, it, expect } from "vitest";
import { checkSalary, THRESHOLDS } from "../salaryCheck";

describe("checkSalary", () => {
  it("flags care worker offers to overseas applicants as critical scam (route closed)", () => {
    const result = checkSalary({ annualSalaryGbp: 26_000, socCode: "6135" });
    expect(result.verdict).toBe("FAIL");
    expect(result.flags.some((f) => f.name === "Care worker route closed" && f.severity === "critical")).toBe(true);
  });

  it("detects care roles from job title when SOC is missing", () => {
    const result = checkSalary({ annualSalaryGbp: 26_000, jobTitle: "Senior Care Assistant" });
    expect(result.verdict).toBe("FAIL");
    expect(result.flags.some((f) => f.name === "Care worker route closed")).toBe(true);
  });

  it("does not flag route closure for in-UK applicants", () => {
    const result = checkSalary({
      annualSalaryGbp: 26_000,
      socCode: "6135",
      applyingFromOverseas: false,
    });
    expect(result.flags.some((f) => f.name === "Care worker route closed")).toBe(false);
  });

  it("fails salaries below the absolute floor", () => {
    const result = checkSalary({ annualSalaryGbp: 18_000, socCode: "2134" });
    expect(result.verdict).toBe("FAIL");
    expect(result.flags.some((f) => f.name === "Below minimum visa salary")).toBe(true);
  });

  it("warns when salary is below the going rate for a known SOC", () => {
    const result = checkSalary({ annualSalaryGbp: 40_000, socCode: "2134" }); // dev going rate 49,400
    expect(result.verdict).toBe("WARN");
    expect(result.flags.some((f) => f.name === "Below going rate for occupation")).toBe(true);
  });

  it("warns below general threshold for non health-and-care roles", () => {
    const result = checkSalary({ annualSalaryGbp: 35_000 }); // no SOC, generic role
    expect(result.verdict).toBe("WARN");
    expect(result.flags.some((f) => f.name === "Below general salary threshold")).toBe(true);
  });

  it("passes a plausible salary above all thresholds", () => {
    const result = checkSalary({ annualSalaryGbp: 55_000, socCode: "2134" });
    expect(result.verdict).toBe("PASS");
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0].passed).toBe(true);
  });

  it("reports the threshold review date for staleness visibility", () => {
    const result = checkSalary({ annualSalaryGbp: 55_000 });
    expect(result.thresholdsReviewedAt).toBe(THRESHOLDS.reviewedAt);
  });
});
