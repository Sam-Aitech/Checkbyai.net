/**
 * stateMachineGuards.test.ts
 *
 * Behavioral coverage for the post-incident safety guards added after the
 * 2026-05-20 mass removal (GOV.UK CSV schema change emptied the fingerprinted
 * file and the state machine removed all 143K sponsors):
 *
 *   1. Mass-removal circuit breaker (+ SPONSOR_ALLOW_MASS_REMOVAL bypass)
 *   2. Phase C2 self-heal resurrection sweep (event and suppressed branches)
 *   3. MIN_TRUSTWORTHY_FINGERPRINT_SET gate on Phases C2/D2 (+ degraded alert)
 *   4. Phase D2 second-miss removal under a trusted fingerprint set
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CsvDiffResult } from "../binaryRunner";

// Queue of results returned by successive db.select().from().where() chains.
// applyStateMachine issues selects in a fixed order (Phase A canonical load →
// Phase C2 stale rows → Phase D2 grace-period rows), so tests enqueue results
// in that order. An exhausted queue yields [].
let selectResults: unknown[][] = [];
const setSpy = vi.fn(() => ({
  where: vi.fn(() => ({ returning: vi.fn(() => []) })),
}));

vi.mock("../../db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => selectResults.shift() ?? []),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => []),
        onConflictDoNothing: vi.fn(() => []),
      })),
    })),
    update: vi.fn(() => ({ set: setSpy })),
    delete: vi.fn(() => ({ where: vi.fn(() => []) })),
    execute: vi.fn(),
  },
}));

vi.mock("../csvFingerprintBuilder", () => ({
  loadFingerprintSet: vi.fn(() => new Set()),
}));

vi.mock("../adminAlert", () => ({
  sendAdminAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../storage", () => ({
  storage: {
    getPendingWatchesByCompanyName: vi.fn(() => []),
    markSponsorWatchNotified: vi.fn(),
  },
}));

vi.mock("../services/notificationEngine", () => ({
  buildEmail: vi.fn(),
  sendViaResend: vi.fn(),
  notifyUsersOfEvent: vi.fn(),
  processQueuedEngineEvents: vi.fn(),
}));

import { applyStateMachine } from "../sponsorStateMachine";
import { loadFingerprintSet } from "../csvFingerprintBuilder";
import { sendAdminAlert } from "../adminAlert";
import { db } from "../../db";

const TODAY = "2026-06-12";

const EMPTY_DIFF: CsvDiffResult = {
  Additions: [],
  Deletions: [],
  Modifications: [],
  durationMs: 0,
};

/** Fingerprint set above MIN_TRUSTWORTHY_FINGERPRINT_SET (50K). */
function trustedSet(extra: string[] = []): Set<string> {
  const set = new Set(Array.from({ length: 60_000 }, (_, i) => `fp-fill-${i}`));
  for (const fp of extra) set.add(fp);
  return set;
}

function deletionDiff(count: number): CsvDiffResult {
  return {
    Additions: [],
    Deletions: Array.from({ length: count }, (_, i) => ({
      "Organisation Name": `Company ${i}`,
      "fingerprint": `fp-del-${i}`,
    })),
    Modifications: [],
    durationMs: 0,
  };
}

function canonicalRows(count: number, status: string) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    fingerprint: `fp-del-${i}`,
    currentName: `Company ${i}`,
    townCity: "London",
    typeRating: "Worker (A rating)",
    route: "Skilled Worker",
    status,
    grantedAt: "2025-01-01",
    consecutiveMisses: 0,
    historicalNames: [],
  }));
}

function alertSubjects(): string[] {
  return vi.mocked(sendAdminAlert).mock.calls.map((c) => c[0] as string);
}

function statusesWritten(): unknown[] {
  return setSpy.mock.calls.map((c) => (c[0] as { status?: unknown })?.status).filter(Boolean);
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResults = [];
  delete process.env.SPONSOR_ALLOW_MASS_REMOVAL;
  vi.mocked(db.execute).mockResolvedValue({ rows: [{ cnt: 100_000 }] });
  vi.mocked(loadFingerprintSet).mockResolvedValue(new Set());
});

afterEach(() => {
  delete process.env.SPONSOR_ALLOW_MASS_REMOVAL;
});

describe("mass-removal circuit breaker", () => {
  it("aborts before applying removals when deletions exceed 20% of live records", async () => {
    selectResults = [canonicalRows(300, "ACTIVE")]; // Phase A load
    vi.mocked(db.execute)
      .mockResolvedValueOnce({ rows: [{ cnt: 100_000 }] }) // Phase C first-run count
      .mockResolvedValueOnce({ rows: [{ cnt: 1_000 }] });  // breaker live count

    await expect(applyStateMachine(deletionDiff(300), TODAY, "dummy"))
      .rejects.toThrow(/circuit breaker/i);

    expect(statusesWritten()).not.toContain("GRACE_PERIOD");
    expect(statusesWritten()).not.toContain("REMOVED_REVOKED");
    expect(alertSubjects().some((s) => s.includes("circuit breaker"))).toBe(true);
  });

  it("does not trip below the threshold", async () => {
    selectResults = [canonicalRows(100, "ACTIVE")];
    vi.mocked(db.execute)
      .mockResolvedValueOnce({ rows: [{ cnt: 100_000 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 1_000 }] }); // 100 <= 20% of 1000

    const result = await applyStateMachine(deletionDiff(100), TODAY, "dummy");

    expect(result.gracePeriodCount).toBe(100);
    expect(statusesWritten()).toContain("GRACE_PERIOD");
  });

  it("is bypassed by SPONSOR_ALLOW_MASS_REMOVAL=1", async () => {
    process.env.SPONSOR_ALLOW_MASS_REMOVAL = "1";
    selectResults = [canonicalRows(300, "ACTIVE")];

    const result = await applyStateMachine(deletionDiff(300), TODAY, "dummy");

    expect(result.gracePeriodCount).toBe(300);
    expect(statusesWritten()).toContain("GRACE_PERIOD");
  });
});

describe("Phase C2 self-heal sweep", () => {
  it("resurrects sponsors present in today's register but marked removed/grace in DB", async () => {
    vi.mocked(loadFingerprintSet).mockResolvedValue(
      trustedSet(["fp-stale-1", "fp-stale-2"]),
    );
    selectResults = [
      [
        { fingerprint: "fp-stale-1", currentName: "Stale One", status: "REMOVED_REVOKED" },
        { fingerprint: "fp-stale-2", currentName: "Stale Two", status: "GRACE_PERIOD" },
      ], // Phase C2 stale rows
      [], // Phase D2 grace-period rows
    ];

    const result = await applyStateMachine(EMPTY_DIFF, TODAY, "dummy");

    expect(result.reactivatedCount).toBe(2);
    const reactivated = result.changes.filter((c) => c.changeType === "RE_ACTIVATED");
    expect(reactivated).toHaveLength(2);
    expect(reactivated[0]).toMatchObject({ newValue: "ACTIVE" });
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ACTIVE", removedAt: null, consecutiveMisses: 0 }),
    );
  });

  it("suppresses per-company events and alerts admins above the mass-repair threshold", async () => {
    const staleFps = Array.from({ length: 1_001 }, (_, i) => `fp-stale-${i}`);
    vi.mocked(loadFingerprintSet).mockResolvedValue(trustedSet(staleFps));
    selectResults = [
      staleFps.map((fp, i) => ({
        fingerprint: fp,
        currentName: `Stale ${i}`,
        status: "REMOVED_REVOKED",
      })),
      [],
    ];

    const result = await applyStateMachine(EMPTY_DIFF, TODAY, "dummy");

    expect(result.reactivatedCount).toBe(1_001);
    expect(result.changes.filter((c) => c.changeType === "RE_ACTIVATED")).toHaveLength(0);
    expect(alertSubjects().some((s) => s.includes("Mass self-heal"))).toBe(true);
  });
});

describe("MIN_TRUSTWORTHY_FINGERPRINT_SET gate", () => {
  it("skips C2/D2 on a small fingerprint set, alerts admins, and removes nothing", async () => {
    vi.mocked(loadFingerprintSet).mockResolvedValue(new Set(["only-one"]));

    const result = await applyStateMachine(EMPTY_DIFF, TODAY, "dummy");

    expect(result.removedCount).toBe(0);
    expect(result.reactivatedCount).toBe(0);
    expect(statusesWritten()).not.toContain("REMOVED_REVOKED");
    expect(alertSubjects().some((s) => s.includes("fingerprint set too small"))).toBe(true);
  });

  it("confirms D2 second-miss removals only under a trusted set", async () => {
    vi.mocked(loadFingerprintSet).mockResolvedValue(trustedSet());
    selectResults = [
      [], // Phase C2 stale rows
      [{ fingerprint: "fp-grace-1", currentName: "Gone Ltd", consecutiveMisses: 1 }], // Phase D2
    ];

    const result = await applyStateMachine(EMPTY_DIFF, TODAY, "dummy");

    expect(result.removedCount).toBe(1);
    expect(result.changes).toContainEqual(
      expect.objectContaining({
        organisationName: "Gone Ltd",
        changeType: "REMOVED_REVOKED",
        previousValue: "GRACE_PERIOD",
      }),
    );
    expect(statusesWritten()).toContain("REMOVED_REVOKED");
  });
});
