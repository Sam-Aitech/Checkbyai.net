import { describe, expect, it } from "vitest";
import { computeParityReport } from "../shadowMode";

describe("computeParityReport", () => {
  it("returns zero parity when production baseline is missing", () => {
    const report = computeParityReport({
      shadow: {
        jobName: "jobAlertJob",
        result: "success",
        metrics: { recordsProcessed: 10, durationMs: 1000 },
        notes: [],
      },
      production: null,
    });

    expect(report.parityScore).toBe(0);
    expect(report.outcomeMatch).toBe(false);
    expect(report.durationDriftMs).toBeNull();
  });

  it("rewards outcome and low drift parity", () => {
    const report = computeParityReport({
      shadow: {
        jobName: "jobAlertJob",
        result: "success",
        metrics: {
          recordsProcessed: 20,
          productionRecordsProcessed: 20,
          durationMs: 2000,
        },
        notes: [],
      },
      production: {
        correlationId: "corr-prod",
        result: "success",
        durationMs: 2200,
      },
    });

    expect(report.outcomeMatch).toBe(true);
    expect(report.durationDriftMs).toBe(200);
    expect(report.recordsDrift).toBe(0);
    expect(report.parityScore).toBeGreaterThanOrEqual(0.9);
  });
});
