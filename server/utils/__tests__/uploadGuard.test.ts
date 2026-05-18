import path from "path";
import { describe, expect, it } from "vitest";

import { sanitizeUploadPath, UPLOADS_DIR } from "../uploadGuard";

describe("sanitizeUploadPath", () => {
  it("allows paths inside the uploads directory", () => {
    const filePath = path.join(UPLOADS_DIR, "nested", "document.pdf");

    expect(sanitizeUploadPath(filePath)).toBe(path.resolve(filePath));
  });

  it("allows the uploads directory root itself", () => {
    expect(sanitizeUploadPath(UPLOADS_DIR)).toBe(UPLOADS_DIR);
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
