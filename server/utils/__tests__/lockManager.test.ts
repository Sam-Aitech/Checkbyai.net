import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the DB
vi.mock("../../db", () => ({
  db: {
    execute: vi.fn(),
  },
}));

import { db } from "../../db";
import { tryAcquireLock, releaseLock, isLockActive } from "../lockManager";

describe("lockManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("tryAcquireLock", () => {
    it("returns true when lock acquisition is successful", async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: [{ job_name: "testJob" }],
      } as any);

      const acquired = await tryAcquireLock("testJob", 1000, "owner1");
      expect(acquired).toBe(true);
      expect(db.execute).toHaveBeenCalled();
    });

    it("returns false when lock acquisition fails (collision / active lock)", async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: [],
      } as any);

      const acquired = await tryAcquireLock("testJob", 1000, "owner1");
      expect(acquired).toBe(false);
    });

    it("returns false and catches error if database throws", async () => {
      vi.mocked(db.execute).mockRejectedValue(new Error("DB Connection Error") as any);

      const acquired = await tryAcquireLock("testJob", 1000, "owner1");
      expect(acquired).toBe(false);
    });
  });

  describe("releaseLock", () => {
    it("executes delete query with correct parameters", async () => {
      vi.mocked(db.execute).mockResolvedValue({ rows: [] } as any);

      await releaseLock("testJob", "owner1");
      expect(db.execute).toHaveBeenCalled();
    });
  });

  describe("isLockActive", () => {
    it("returns true if lock is active", async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: [{ active: true }],
      } as any);

      const active = await isLockActive("testJob");
      expect(active).toBe(true);
    });

    it("returns false if lock is not active", async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: [{ active: false }],
      } as any);

      const active = await isLockActive("testJob");
      expect(active).toBe(false);
    });
  });
});
