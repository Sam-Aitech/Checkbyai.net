import path from "path";
import fs from "fs";
import os from "os";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

// UPLOADS_DIR defaults to <cwd>/uploads when UPLOADS_DIR is unset, which is the
// real uploads directory this repo ships from. Point it at a throwaway temp
// directory BEFORE importing uploadGuard, so the rm/mkdir cycles in the tests
// below can never reach — let alone delete — real uploaded documents.
const tmpUploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "uploadguard-test-"));
process.env.UPLOADS_DIR = tmpUploadsDir;

let assertPdfMagicBytes: typeof import("../uploadGuard").assertPdfMagicBytes;
let assertSafeUploadFilename: typeof import("../uploadGuard").assertSafeUploadFilename;
let sanitizeUploadPath: typeof import("../uploadGuard").sanitizeUploadPath;
let UPLOADS_DIR: typeof import("../uploadGuard").UPLOADS_DIR;

beforeAll(async () => {
  ({ assertPdfMagicBytes, assertSafeUploadFilename, sanitizeUploadPath, UPLOADS_DIR } =
    await import("../uploadGuard"));
});

describe("sanitizeUploadPath", () => {
  beforeEach(() => {
    fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
  });

  it("allows paths inside the uploads directory", () => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const filePath = path.join(UPLOADS_DIR, "nested", "document.pdf");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "ok");
    expect(fs.existsSync(filePath)).toBe(true);

    expect(sanitizeUploadPath(filePath)).toBe(fs.realpathSync(filePath));
  });

  it("allows the uploads directory root itself", () => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    expect(sanitizeUploadPath(UPLOADS_DIR)).toBe(fs.realpathSync(UPLOADS_DIR));
  });

  it("rejects traversal outside the uploads directory", () => {
    const outsidePath = path.join(UPLOADS_DIR, "..", "etc", "passwd");

    expect(() => sanitizeUploadPath(outsidePath)).toThrow(/PATH_TRAVERSAL_BLOCKED/);
  });

  it("rejects prefix bypass paths outside the uploads directory", () => {
    const bypassPath = `${UPLOADS_DIR}_evil/document.pdf`;

    expect(() => sanitizeUploadPath(bypassPath)).toThrow(/PATH_TRAVERSAL_BLOCKED/);
  });
});

describe("assertSafeUploadFilename", () => {
  it("allows normal filenames", () => {
    expect(() => assertSafeUploadFilename("document.pdf")).not.toThrow();
    expect(() => assertSafeUploadFilename("my-cos_2026.pdf")).not.toThrow();
  });

  it("rejects empty or whitespace filenames", () => {
    expect(() => assertSafeUploadFilename("")).toThrow(/INVALID_UPLOAD_FILENAME/);
    expect(() => assertSafeUploadFilename("   ")).toThrow(/INVALID_UPLOAD_FILENAME/);
  });

  it("rejects path separator characters", () => {
    expect(() => assertSafeUploadFilename("folder/file.pdf")).toThrow(/INVALID_UPLOAD_FILENAME/);
    expect(() => assertSafeUploadFilename("folder\\file.pdf")).toThrow(/INVALID_UPLOAD_FILENAME/);
  });

  it("rejects traversal sequences", () => {
    expect(() => assertSafeUploadFilename("../file.pdf")).toThrow(/INVALID_UPLOAD_FILENAME/);
    expect(() => assertSafeUploadFilename("..\\file.pdf")).toThrow(/INVALID_UPLOAD_FILENAME/);
  });

  it("rejects control characters", () => {
    expect(() => assertSafeUploadFilename("evil\u0000.pdf")).toThrow(/INVALID_UPLOAD_FILENAME/);
  });
});

describe("assertPdfMagicBytes", () => {
  beforeEach(() => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
  });

  it("allows a file starting with the PDF header", async () => {
    const filePath = path.join(UPLOADS_DIR, "genuine.pdf");
    fs.writeFileSync(filePath, "%PDF-1.4\n1 0 obj\n<< >>\nendobj\n");

    await expect(assertPdfMagicBytes(filePath)).resolves.toBeUndefined();
  });

  it("rejects a file with a spoofed mimetype but non-PDF content", async () => {
    const filePath = path.join(UPLOADS_DIR, "fake.pdf");
    fs.writeFileSync(filePath, "<html><body>not a pdf</body></html>");

    await expect(assertPdfMagicBytes(filePath)).rejects.toThrow(/INVALID_FILE_TYPE/);
  });

  it("rejects an empty file", async () => {
    const filePath = path.join(UPLOADS_DIR, "empty.pdf");
    fs.writeFileSync(filePath, "");

    await expect(assertPdfMagicBytes(filePath)).rejects.toThrow(/INVALID_FILE_TYPE/);
  });

  it("rejects a file shorter than the magic byte sequence", async () => {
    const filePath = path.join(UPLOADS_DIR, "truncated.pdf");
    fs.writeFileSync(filePath, "%PD");

    await expect(assertPdfMagicBytes(filePath)).rejects.toThrow(/INVALID_FILE_TYPE/);
  });

  it("rejects a PDF header appearing later in the file, not at the start", async () => {
    const filePath = path.join(UPLOADS_DIR, "prefixed.pdf");
    fs.writeFileSync(filePath, "junk%PDF-1.4\n");

    await expect(assertPdfMagicBytes(filePath)).rejects.toThrow(/INVALID_FILE_TYPE/);
  });
});
