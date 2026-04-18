import { describe, expect, it } from "vitest";
import { evaluateSeverity } from "../incidentManager";
import type { JobHealthSnapshot } from "../jobTelemetry";

function snap(
  jobName: string,
  staleByMinutes: number | null,
  opts: Partial<JobHealthSnapshot> = {},
): JobHealthSnapshot {
  return {
    jobName,
    running: false,
    lastSuccessAt: staleByMinutes !== null ? new Date(Date.now() - staleByMinutes * 60_000).toISOString() : null,
    lastFailureAt: null,
    lastRunMode: null,
    staleByMinutes,
    ...opts,
  };
}

describe("evaluateSeverity", () => {
  it("returns null for an unknown job name", () => {
    expect(evaluateSeverity(snap("unknownJob", 9999))).toBeNull();
  });

  it("returns null when staleByMinutes is null and no failure recorded", () => {
    expect(
      evaluateSeverity(snap("notificationDrain", null, { lastSuccessAt: null, lastFailureAt: null })),
    ).toBeNull();
  });

  it("returns P1 when job has never succeeded but has a recorded failure", () => {
    expect(
      evaluateSeverity(
        snap("sponsorMonitorJob", null, {
          lastSuccessAt: null,
          lastFailureAt: new Date().toISOString(),
        }),
      ),
    ).toBe("P1");
  });

  it("returns null for hourly job stale 60 minutes (below P3 threshold)", () => {
    expect(evaluateSeverity(snap("notificationDrain", 60))).toBeNull();
  });

  it("returns P3 for hourly job stale 80 minutes", () => {
    expect(evaluateSeverity(snap("notificationDrain", 80))).toBe("P3");
  });

  it("returns P2 for hourly job stale 95 minutes", () => {
    expect(evaluateSeverity(snap("enrichmentBatch", 95))).toBe("P2");
  });

  it("returns P1 for hourly job stale 200 minutes", () => {
    expect(evaluateSeverity(snap("notificationDrain", 200))).toBe("P1");
  });

  it("returns P0 for hourly job stale 400 minutes", () => {
    expect(evaluateSeverity(snap("enrichmentBatch", 400))).toBe("P0");
  });

  it("returns null for daily job stale 20 hours (below P3 threshold of 26 h)", () => {
    expect(evaluateSeverity(snap("sponsorMonitorJob", 20 * 60))).toBeNull();
  });

  it("returns P3 for daily job stale 27 hours", () => {
    expect(evaluateSeverity(snap("sponsorMonitorJob", 27 * 60))).toBe("P3");
  });

  it("returns P2 for daily job stale 37 hours", () => {
    expect(evaluateSeverity(snap("jobAlertJob", 37 * 60))).toBe("P2");
  });

  it("returns P1 for daily job stale 50 hours", () => {
    expect(evaluateSeverity(snap("enrichmentSeed", 50 * 60))).toBe("P1");
  });

  it("returns P0 for daily job stale 75 hours", () => {
    expect(evaluateSeverity(snap("sponsorMonitorJob", 75 * 60))).toBe("P0");
  });
});
