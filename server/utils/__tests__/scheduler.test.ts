import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCutoverStatusSnapshot } from "../scheduler";

function setEnv(vars: Record<string, string | undefined>): void {
  for (const [key, val] of Object.entries(vars)) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
}

const ALL_FLAGS = [
  "CUTOVER_NOTIFICATION_DRAIN",
  "CUTOVER_ENRICHMENT_BATCH",
  "CUTOVER_ENRICHMENT_SEED",
  "CUTOVER_JOB_ALERT",
  "CUTOVER_SPONSOR_MONITOR",
] as const;

describe("getCutoverStatusSnapshot", () => {
  beforeEach(() => {
    for (const flag of ALL_FLAGS) {
      delete process.env[flag];
    }
  });

  afterEach(() => {
    for (const flag of ALL_FLAGS) {
      delete process.env[flag];
    }
  });

  it("returns 5 jobs with all owned by inline-cron when no flags set", () => {
    const snap = getCutoverStatusSnapshot();
    expect(snap).toHaveLength(5);
    for (const s of snap) {
      expect(s.cutover).toBe(false);
      expect(s.owner).toBe("inline-cron");
    }
  });

  it("marks NOTIFICATION_DRAIN as cutover when env flag is true", () => {
    setEnv({ CUTOVER_NOTIFICATION_DRAIN: "true" });
    const snap = getCutoverStatusSnapshot();
    const drain = snap.find((s) => s.job === "NOTIFICATION_DRAIN");
    expect(drain?.cutover).toBe(true);
    expect(drain?.owner).toBe("central-scheduler");
  });

  it("accepts '1' as a truthy flag value", () => {
    setEnv({ CUTOVER_ENRICHMENT_BATCH: "1" });
    const snap = getCutoverStatusSnapshot();
    const batch = snap.find((s) => s.job === "ENRICHMENT_BATCH");
    expect(batch?.cutover).toBe(true);
  });

  it("treats 'false' as non-cutover", () => {
    setEnv({ CUTOVER_SPONSOR_MONITOR: "false" });
    const snap = getCutoverStatusSnapshot();
    const monitor = snap.find((s) => s.job === "SPONSOR_MONITOR");
    expect(monitor?.cutover).toBe(false);
    expect(monitor?.owner).toBe("inline-cron");
  });

  it("all 5 jobs become central-scheduler when all flags set", () => {
    setEnv({
      CUTOVER_NOTIFICATION_DRAIN: "true",
      CUTOVER_ENRICHMENT_BATCH: "true",
      CUTOVER_ENRICHMENT_SEED: "true",
      CUTOVER_JOB_ALERT: "true",
      CUTOVER_SPONSOR_MONITOR: "true",
    });
    const snap = getCutoverStatusSnapshot();
    expect(snap.every((s) => s.cutover)).toBe(true);
    expect(snap.every((s) => s.owner === "central-scheduler")).toBe(true);
  });

  it("includes correct cron schedules for each job", () => {
    const snap = getCutoverStatusSnapshot();
    const scheduleMap = Object.fromEntries(snap.map((s) => [s.job, s.schedule]));
    expect(scheduleMap.NOTIFICATION_DRAIN).toBe("0 * * * *");
    expect(scheduleMap.ENRICHMENT_BATCH).toBe("15 * * * *");
    expect(scheduleMap.ENRICHMENT_SEED).toBe("0 2 * * *");
    expect(scheduleMap.JOB_ALERT).toBe("0 2 * * 1-5");
    expect(scheduleMap.SPONSOR_MONITOR).toBe("30 0 * * 1-5");
  });

  it("partial cutover — only cut-over jobs show central-scheduler", () => {
    setEnv({
      CUTOVER_NOTIFICATION_DRAIN: "true",
      CUTOVER_ENRICHMENT_BATCH: "true",
    });
    const snap = getCutoverStatusSnapshot();
    const central = snap.filter((s) => s.owner === "central-scheduler").map((s) => s.job);
    const inline = snap.filter((s) => s.owner === "inline-cron").map((s) => s.job);
    expect(central).toContain("NOTIFICATION_DRAIN");
    expect(central).toContain("ENRICHMENT_BATCH");
    expect(inline).toContain("ENRICHMENT_SEED");
    expect(inline).toContain("JOB_ALERT");
    expect(inline).toContain("SPONSOR_MONITOR");
  });
});
