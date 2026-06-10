import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyStateMachine } from "../sponsorStateMachine";
import type { CsvDiffResult } from "../binaryRunner";

// Mock the DB and other external services
vi.mock("../../db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => [])
        }))
      }))
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => []),
        onConflictDoNothing: vi.fn(() => [])
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => [])
        }))
      }))
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => [])
    })),
    execute: vi.fn()
  }
}));

vi.mock("../csvFingerprintBuilder", () => ({
  loadFingerprintSet: vi.fn(() => new Set())
}));

vi.mock("../../storage", () => ({
  storage: {
    getPendingWatchesByCompanyName: vi.fn(() => [])
  }
}));

vi.mock("../services/notificationEngine", () => ({
  buildEmail: vi.fn(),
  sendViaResend: vi.fn(),
  notifyUsersOfEvent: vi.fn(),
  processQueuedEngineEvents: vi.fn()
}));

// We need to import the mocked db to set its behavior
import { db } from "../../db";
import { storage } from "../../storage";

describe("sponsorStateMachine - first run logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.execute as any).mockResolvedValue({ rows: [{ cnt: 0 }] });
  });

  it("should NOT generate NEW_LICENCE changes during a massive first-run seed (>100k records)", async () => {
    const today = "2026-04-23";
    
    // 1. Setup mock for Phase A (empty canonical)
    (db.select as any).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => [])
      }))
    });

    // 2. Build a massive diff (simulating 100,001 additions)
    const largeAdditions = Array.from({ length: 100001 }, (_, i) => ({
      "Organisation Name": `Company ${i}`,
      "Town/City": "London",
      "Route": "Skilled Worker",
      "Type & Rating": "A rating",
      "fingerprint": `fp-${i}`
    }));

    const diff: CsvDiffResult = {
      Additions: largeAdditions,
      Deletions: [],
      Modifications: [],
      durationMs: 0
    };

    const result = await applyStateMachine(diff, today, "dummy_path");

    // 3. Verify changes array is empty (NEW_LICENCE suppressed)
    // We filter for NEW_LICENCE because other change types might still occur if there were any matches (none here)
    const newLicenceChanges = result.changes.filter(c => c.changeType === "NEW_LICENCE");
    expect(newLicenceChanges.length).toBe(0);
    expect(result.addedCount).toBe(100001);
  });

  it("should NOT call storage.getPendingWatchesByCompanyName during a massive first-run seed", async () => {
    const today = "2026-04-23";
    
    // Empty canonical
    (db.select as any).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => [])
      }))
    });

    // Massive diff
    const largeAdditions = Array.from({ length: 10001 }, (_, i) => ({
      "Organisation Name": `Company ${i}`,
      "fingerprint": `fp-${i}`
    }));

    const diff: CsvDiffResult = {
      Additions: largeAdditions as any,
      Deletions: [],
      Modifications: [],
      durationMs: 0
    };

    await applyStateMachine(diff, today, "dummy_path");

    // Verify storage check was skipped
    expect(storage.getPendingWatchesByCompanyName).not.toHaveBeenCalled();
  });
});
