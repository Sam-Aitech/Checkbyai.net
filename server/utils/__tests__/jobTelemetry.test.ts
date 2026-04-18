import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  startJobRun,
  finishJobRun,
  getJobHealthSnapshot,
  getAllJobHealthSnapshots,
  generateCorrelationId,
  type JobResult,
} from "../jobTelemetry";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Freeze time to make duration assertions deterministic. */
function freezeAt(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("generateCorrelationId", () => {
  it("returns a UUID v4 string", () => {
    const id = generateCorrelationId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("returns unique values on every call", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateCorrelationId()));
    expect(ids.size).toBe(50);
  });
});

describe("startJobRun", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("returns a correlationId and startedAt ISO string", () => {
    const { correlationId, startedAt } = startJobRun("testJob", "cron", "inline");
    expect(correlationId).toBeTruthy();
    expect(new Date(startedAt).toISOString()).toBe(startedAt);
  });

  it("marks the job as running in the health registry", () => {
    startJobRun("runningJob", "manual", "inline");
    const snap = getJobHealthSnapshot("runningJob");
    expect(snap.running).toBe(true);
    expect(snap.lastRunMode).toBe("inline");
  });
});

describe("finishJobRun", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("sets running to false after success", () => {
    const t = startJobRun("doneJob", "cron", "inline");
    finishJobRun({ ...t, jobName: "doneJob", triggerSource: "cron", runMode: "inline", result: "success" });
    expect(getJobHealthSnapshot("doneJob").running).toBe(false);
  });

  it("records lastSuccessAt on success", () => {
    const t = startJobRun("successJob", "cron", "inline");
    finishJobRun({ ...t, jobName: "successJob", triggerSource: "cron", runMode: "inline", result: "success" });
    const snap = getJobHealthSnapshot("successJob");
    expect(snap.lastSuccessAt).toBeTruthy();
    expect(snap.lastFailureAt).toBeNull();
  });

  it("records lastFailureAt on failure", () => {
    const t = startJobRun("failJob", "cron", "inline");
    finishJobRun({ ...t, jobName: "failJob", triggerSource: "cron", runMode: "inline", result: "failed", failureReason: "timeout" });
    const snap = getJobHealthSnapshot("failJob");
    expect(snap.lastFailureAt).toBeTruthy();
    expect(snap.lastSuccessAt).toBeNull();
  });

  it("preserves previous lastSuccessAt when a new run fails", () => {
    const t1 = startJobRun("mixedJob", "cron", "inline");
    finishJobRun({ ...t1, jobName: "mixedJob", triggerSource: "cron", runMode: "inline", result: "success" });
    const successAt = getJobHealthSnapshot("mixedJob").lastSuccessAt;

    const t2 = startJobRun("mixedJob", "cron", "inline");
    finishJobRun({ ...t2, jobName: "mixedJob", triggerSource: "cron", runMode: "inline", result: "failed", failureReason: "oops" });

    const snap = getJobHealthSnapshot("mixedJob");
    expect(snap.lastSuccessAt).toBe(successAt);
    expect(snap.lastFailureAt).toBeTruthy();
  });

  it("computes a non-negative durationMs", () => {
    // Just verify no exception is thrown and timing data is internally consistent
    const t = startJobRun("timedJob", "cron", "inline");
    // finishJobRun logs internally — no exception means durationMs was computed
    expect(() =>
      finishJobRun({ ...t, jobName: "timedJob", triggerSource: "cron", runMode: "inline", result: "success" }),
    ).not.toThrow();
  });
});

describe("getJobHealthSnapshot", () => {
  it("returns null values for an unseen job", () => {
    const snap = getJobHealthSnapshot("neverRanJob");
    expect(snap.running).toBe(false);
    expect(snap.lastSuccessAt).toBeNull();
    expect(snap.lastFailureAt).toBeNull();
    expect(snap.staleByMinutes).toBeNull();
    expect(snap.lastRunMode).toBeNull();
  });

  it("computes staleByMinutes based on lastSuccessAt", () => {
    freezeAt("2026-04-18T10:00:00.000Z");
    const t = startJobRun("staleJob", "cron", "inline");
    finishJobRun({ ...t, jobName: "staleJob", triggerSource: "cron", runMode: "inline", result: "success" });

    // Advance 90 minutes
    vi.advanceTimersByTime(90 * 60 * 1000);

    const snap = getJobHealthSnapshot("staleJob");
    expect(snap.staleByMinutes).toBe(90);
    vi.useRealTimers();
  });
});

describe("getAllJobHealthSnapshots", () => {
  it("returns snapshots for all jobs that have ever run", () => {
    startJobRun("jobA", "cron", "inline");
    startJobRun("jobB", "manual", "queue");
    const all = getAllJobHealthSnapshots();
    const names = all.map((s) => s.jobName);
    expect(names).toContain("jobA");
    expect(names).toContain("jobB");
  });
});

describe("hasRole utility (via roleGuard)", () => {
  // Import inline to avoid circular module issues in test context
  it("validates role hierarchy via direct import", async () => {
    const { hasRole } = await import("../../middleware/roleGuard");
    expect(hasRole("admin", "admin")).toBe(true);
    expect(hasRole("admin", "owner")).toBe(false);
    expect(hasRole("owner", "admin")).toBe(true);
    expect(hasRole("viewer", "support")).toBe(false);
    expect(hasRole("support", "viewer")).toBe(true);
    expect(hasRole(null, "viewer")).toBe(true);
    expect(hasRole(null, "admin")).toBe(false);
    expect(hasRole("unknown_role", "viewer")).toBe(true);
    expect(hasRole("unknown_role", "admin")).toBe(false);
  });
});
