import { beforeEach, describe, expect, it, vi } from "vitest";

const storeCalls = {
  got: [] as string[],
  deleted: [] as string[],
};

const memFs = new Map<string, Buffer>();

const analysisMock = vi.fn();
const emitMock = vi.fn();

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      writeFile: async (p: unknown, data: unknown) => {
        memFs.set(String(p), Buffer.from(data as Uint8Array));
      },
      readFile: async (p: unknown) => {
        const hit = memFs.get(String(p));
        if (!hit) {
          throw Object.assign(new Error(`ENOENT: no such file or directory, open '${String(p)}'`), {
            code: "ENOENT",
          });
        }
        return hit;
      },
      unlink: async (p: unknown) => {
        memFs.delete(String(p));
      },
    },
  };
});

vi.mock("../../db", () => ({
  db: {
    transaction: async (cb: any) => {
      const tx = {
        update: () => ({ set: () => ({ where: async () => undefined }) }),
        select: () => ({ from: () => ({ where: async () => [] }) }),
        insert: () => ({
          values: () => ({ returning: async () => [{ id: 42 }] }),
        }),
      };
      return cb(tx);
    },
  },
}));

vi.mock("../../services/verificationAnalysis", () => ({
  runVerificationAnalysis: (...args: any[]) => analysisMock(...args),
}));

vi.mock("../../services/documentStore", () => ({
  getDocumentStore: () => ({
    get: async (key: string) => {
      storeCalls.got.push(key);
      return Buffer.from("%PDF-1.4 test");
    },
    put: async () => undefined,
    delete: async (key: string) => {
      storeCalls.deleted.push(key);
    },
    purgeStale: async () => 0,
  }),
}));

vi.mock("../../services/socketGateway", () => ({
  emitToUser: (...args: any[]) => emitMock(...args),
}));

import { processVerificationJob, isLastAttempt } from "../verificationWorker";

const baseData = {
  documentKey: "verify/CBA-AAAA-1111/abc123.pdf",
  userId: "u-test",
  receiptId: "CBA-AAAA-1111",
  documentHash: "abc123",
  originalName: "test.pdf",
  ipAddress: "127.0.0.1",
  useCredits: false,
  useDailyLimit: false,
};

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    data: { ...baseData },
    attemptsMade: 0,
    opts: { attempts: 2 },
    updateProgress: async () => undefined,
    ...overrides,
  } as any;
}

const okAnalysis = {
  result: "genuine",
  analysis: { confidence: 92, details: {}, checks: [] },
  metadata: {},
};

function workerTmpFiles(): string[] {
  return [...memFs.keys()].filter((k) => k.includes("worker-"));
}

describe("verification worker document lifecycle", () => {
  beforeEach(() => {
    storeCalls.got.length = 0;
    storeCalls.deleted.length = 0;
    memFs.clear();
    analysisMock.mockReset();
    emitMock.mockReset();
  });

  it("keeps the stored object when a retryable attempt fails, deletes it on success", async () => {
    analysisMock.mockRejectedValueOnce(new Error("transient DB outage"));
    analysisMock.mockResolvedValueOnce(okAnalysis);

    await expect(processVerificationJob(makeJob({ attemptsMade: 0 }))).rejects.toThrow(
      "transient DB outage",
    );
    expect(storeCalls.deleted).not.toContain(baseData.documentKey);
    expect(workerTmpFiles()).toEqual([]);

    const payload = await processVerificationJob(makeJob({ id: "job-1-retry", attemptsMade: 1 }));
    expect(payload.receiptId).toBe("CBA-AAAA-1111");
    expect(storeCalls.got).toEqual([baseData.documentKey, baseData.documentKey]);
    expect(storeCalls.deleted).toEqual([baseData.documentKey]);
    expect(workerTmpFiles()).toEqual([]);
  });

  it("deletes the stored object only after the last attempt fails", async () => {
    analysisMock.mockRejectedValue(new Error("parser blew up"));
    await expect(
      processVerificationJob(makeJob({ attemptsMade: 1, opts: { attempts: 2 } })),
    ).rejects.toThrow("parser blew up");
    expect(storeCalls.deleted).toEqual([baseData.documentKey]);
    expect(workerTmpFiles()).toEqual([]);
  });

  it("deletes the stored object on first-try success", async () => {
    analysisMock.mockResolvedValue(okAnalysis);
    await processVerificationJob(makeJob({ attemptsMade: 0 }));
    expect(storeCalls.deleted).toEqual([baseData.documentKey]);
    expect(workerTmpFiles()).toEqual([]);
  });

  it("classifies last attempts correctly", () => {
    expect(isLastAttempt({ attemptsMade: 0, opts: { attempts: 2 } } as any)).toBe(false);
    expect(isLastAttempt({ attemptsMade: 1, opts: { attempts: 2 } } as any)).toBe(true);
    expect(isLastAttempt({ attemptsMade: 0, opts: {} } as any)).toBe(true);
  });
});
