import path from "path";
import fs from "fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertSafeUploadFilename, sanitizeUploadPath, UPLOADS_DIR } from "../uploadGuard";

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
