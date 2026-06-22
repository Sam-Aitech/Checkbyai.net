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

vi.mock("../emailTemplates", () => ({
  buildEmail: vi.fn(),
}));

vi.mock("../notificationDispatcher", () => ({
  sendViaResend: vi.fn(),
}));

// We need to import the mocked db to set its behavior
import { db } from "../../db";

describe("RE_ACTIVATED logic in sponsorStateMachine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.execute as any).mockResolvedValue({ rows: [{ cnt: 1000 }] });
  });

  it("should detect RE_ACTIVATED when a REMOVED_REVOKED company appears in additions", async () => {
    const today = "2026-04-23";
    const fingerprint = "test-company|london|skilled-worker";
    
    // 1. Setup mock: existing canonical record is REMOVED_REVOKED
    (db.select as any).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => [
          {
            id: 1,
            fingerprint,
            currentName: "Test Company",
            status: "REMOVED_REVOKED",
            consecutiveMisses: 5
          }
        ])
      }))
    });

    const diff: CsvDiffResult = {
      Additions: [
        {
          "Organisation Name": "Test Company",
          "Town/City": "London",
          "Route": "Skilled Worker",
          "Type & Rating": "A rating",
          "fingerprint": fingerprint
        }
      ],
      Deletions: [],
      Modifications: [],
      durationMs: 0
    };

    const result = await applyStateMachine(diff, today, "dummy_path");

    // 2. Verify RE_ACTIVATED change is detected
    const reActivatedChange = result.changes.find(c => c.changeType === "RE_ACTIVATED");
    expect(reActivatedChange).toBeDefined();
    expect(reActivatedChange?.organisationName).toBe("Test Company");
    expect(result.reactivatedCount).toBe(1);

    // 3. Verify status update to NEWLY_GRANTED
    expect(db.update).toHaveBeenCalledWith(expect.anything());
  });

  // A more complex case where fuzzy matching handles the pair first, so
  // RE_ACTIVATED shouldn't fire for the "new" fingerprint when it was
  // reconciled as a rename. Not yet implemented.
  it.todo("should suppress RE_ACTIVATED if the company is actually a rename (handled in Phase E/Fuzzy)");
});
