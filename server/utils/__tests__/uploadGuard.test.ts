import path from "path";
import fs from "fs";
import { describe, expect, it } from "vitest";

import { sanitizeUploadPath, UPLOADS_DIR } from "../uploadGuard";

describe("sanitizeUploadPath", () => {
  it("allows paths inside the uploads directory", () => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const filePath = path.join(UPLOADS_DIR, "nested", "document.pdf");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "ok");

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
