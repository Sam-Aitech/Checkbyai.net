import { describe, it, expect, vi, beforeEach } from "vitest";

const dbState = {
  insertedRow: { id: "row-1" } as { id: string },
  selectedRow: undefined as { fileBytes: Buffer; originalname: string } | undefined,
  deletedRows: [] as { id: string }[],
  capturedInsertValues: null as any,
  capturedWhere: null as any,
};

vi.mock("../../db", () => {
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn((values: any) => {
        dbState.capturedInsertValues = values;
        return {
          returning: vi.fn(() => Promise.resolve([dbState.insertedRow])),
        };
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((whereClause: any) => {
          dbState.capturedWhere = whereClause;
          return {
            limit: vi.fn(() =>
              Promise.resolve(dbState.selectedRow ? [dbState.selectedRow] : []),
            ),
          };
        }),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn((whereClause: any) => {
        dbState.capturedWhere = whereClause;
        return {
          returning: vi.fn(() => Promise.resolve(dbState.deletedRows)),
          then: (resolve: any) => Promise.resolve().then(resolve),
        };
      }),
    })),
  };
  return { db };
});

const { storePdfUpload, fetchPdfUpload, deletePdfUpload, sweepStalePdfUploads } = await import(
  "../pdfUploadStore"
);

describe("storePdfUpload", () => {
  beforeEach(() => {
    dbState.capturedInsertValues = null;
    dbState.insertedRow = { id: "row-1" };
  });

  it("inserts the bytes and returns the new row's id", async () => {
    const bytes = Buffer.from("%PDF-1.4 fake content");
    const id = await storePdfUpload("user-1", bytes, "cos.pdf");
    expect(id).toBe("row-1");
    expect(dbState.capturedInsertValues).toEqual({
      userId: "user-1",
      fileBytes: bytes,
      originalname: "cos.pdf",
    });
  });
});

describe("fetchPdfUpload", () => {
  beforeEach(() => {
    dbState.selectedRow = undefined;
  });

  it("returns the row's bytes and originalname when found", async () => {
    const bytes = Buffer.from("%PDF-1.4 fake content");
    dbState.selectedRow = { fileBytes: bytes, originalname: "cos.pdf" };
    const result = await fetchPdfUpload("row-1");
    expect(result).toEqual({ fileBytes: bytes, originalname: "cos.pdf" });
  });

  it("returns undefined when no row matches", async () => {
    dbState.selectedRow = undefined;
    const result = await fetchPdfUpload("missing-id");
    expect(result).toBeUndefined();
  });
});

describe("deletePdfUpload", () => {
  it("does not throw even if the underlying delete rejects", async () => {
    const { db } = await import("../../db");
    (db.delete as any).mockImplementationOnce(() => ({
      where: () => Promise.reject(new Error("connection lost")),
    }));
    await expect(deletePdfUpload("row-1")).resolves.toBeUndefined();
  });
});

describe("sweepStalePdfUploads", () => {
  beforeEach(() => {
    dbState.deletedRows = [];
  });

  it("returns the count of rows deleted", async () => {
    dbState.deletedRows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const count = await sweepStalePdfUploads(60 * 60 * 1000);
    expect(count).toBe(3);
  });

  it("returns 0 when nothing is old enough to sweep", async () => {
    dbState.deletedRows = [];
    const count = await sweepStalePdfUploads(60 * 60 * 1000);
    expect(count).toBe(0);
  });
});
