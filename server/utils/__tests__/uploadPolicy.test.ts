import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const dir = vi.hoisted(() => {
  const tmp = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "uploads-test-"));
  process.env.UPLOADS_DIR = tmp;
  return tmp as string;
});

vi.mock("../logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import express from "express";
import request from "supertest";
import { errorHandler } from "../../lib/errorHandler";
import {
  UPLOAD_PROFILES,
  detectFileKind,
  toDisplayFilename,
  uploadPaidDocs,
  uploadSinglePdf,
  validateUploadFilename,
  verifyUploadedFiles,
  withUploadCleanup,
} from "../uploadPolicy";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);

/** Cleanup runs right after the response is written, so wait for the directory to drain. */
async function noFilesLeft(): Promise<void> {
  await vi.waitFor(() => expect(filesOnDisk()).toEqual([]), { timeout: 2000, interval: 10 });
}

function filesOnDisk(): string[] {
  return fs.readdirSync(dir);
}

function buildApp() {
  const app = express();
  const requireUser = (req: any, res: any, next: any) =>
    req.headers["x-user"] ? next() : res.status(401).json({ message: "Unauthorized" });

  // Mirrors /api/verify: auth first, then multer, then real-signature check, always cleanup.
  app.post(
    "/verify",
    requireUser,
    uploadSinglePdf,
    withUploadCleanup(async (req: any, res: any, next: any) => {
      try {
        if (!req.file) return res.status(400).json({ message: "No file" });
        await verifyUploadedFiles(req, UPLOAD_PROFILES.singlePdf);
        res.json({ ok: true, name: req.file.originalname, storedAs: path.basename(req.file.path) });
      } catch (e) {
        next(e);
      }
    }),
  );

  app.post(
    "/paid",
    requireUser,
    uploadPaidDocs,
    withUploadCleanup(async (req: any, res: any, next: any) => {
      try {
        await verifyUploadedFiles(req, UPLOAD_PROFILES.paidDocs);
        res.json({ ok: true });
      } catch (e) {
        next(e);
      }
    }),
  );
  // Same stance as server/index.ts: nothing under /uploads is ever served.
  app.use("/uploads", (_req, res) => res.status(403).json({ message: "Forbidden" }));
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  for (const f of filesOnDisk()) fs.rmSync(path.join(dir, f), { force: true, recursive: true });
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("validateUploadFilename", () => {
  const p = UPLOAD_PROFILES.singlePdf;
  it("accepts a normal pdf", () => expect(validateUploadFilename("CoS letter.PDF", p)).toBe(".pdf"));

  it.each([
    "evil.php.pdf",
    "shell.phtml.pdf",
    "x.exe.pdf",
    "page.html.pdf",
    "vector.svg.pdf",
    "a.js.pdf",
  ])("rejects double extension %s", (name) => {
    expect(() => validateUploadFilename(name, p)).toThrow(/not allowed/);
  });

  it.each(["doc.pdf.exe", "doc.php", "doc", ".pdf", "doc.pdf ", "doc.pdf.php"])("rejects %s", (name) => {
    if (name === "doc.pdf ") return; // trailing space is trimmed to a valid name
    expect(() => validateUploadFilename(name, p)).toThrow();
  });

  it.each(["../../etc/passwd.pdf", "..\\..\\win.pdf", "a/b.pdf", "a\\b.pdf", "a\u0000.pdf", "x..pdf"])(
    "rejects traversal / control characters in %j",
    (name) => {
      expect(() => validateUploadFilename(name, p)).toThrow(/forbidden/);
    },
  );

  it("enforces per-field allowlists for paid documents", () => {
    const paid = UPLOAD_PROFILES.paidDocs;
    expect(validateUploadFilename("cos.pdf", paid, "cosDocument")).toBe(".pdf");
    expect(() => validateUploadFilename("cos.png", paid, "cosDocument")).toThrow(/not allowed/);
    expect(validateUploadFilename("proof.png", paid, "supportingDocuments")).toBe(".png");
  });
});

describe("detectFileKind / toDisplayFilename", () => {
  it("sniffs signatures", () => {
    expect(detectFileKind(PDF)).toBe("pdf");
    expect(detectFileKind(PNG)).toBe("png");
    expect(detectFileKind(JPEG)).toBe("jpeg");
    expect(detectFileKind(Buffer.from("<?php echo 1;"))).toBeNull();
    expect(detectFileKind(Buffer.from("MZ\x90\x00"))).toBeNull();
    expect(detectFileKind(Buffer.alloc(0))).toBeNull();
  });
  it("builds a safe, capped display name", () => {
    expect(toDisplayFilename("../../a/b\\c<d>.pdf")).toBe("c_d_.pdf");
    expect(toDisplayFilename("x".repeat(500) + ".pdf").length).toBeLessThanOrEqual(120);
    expect(toDisplayFilename("")).toBe("upload");
  });
});

describe("upload middleware over HTTP", () => {
  const app = buildApp();

  it("accepts a legitimate PDF, stores it under a server-generated name, then cleans up", async () => {
    const res = await request(app).post("/verify").set("x-user", "u1").attach("file", PDF, { filename: "cos.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(200);
    expect(res.body.storedAs).toMatch(/^[0-9a-f]{32}$/); // random, extension-less, not the client name
    await noFilesLeft();
  });

  it("rejects a spoofed MIME type: PHP bytes labelled application/pdf with a .pdf name", async () => {
    const res = await request(app)
      .post("/verify")
      .set("x-user", "u1")
      .attach("file", Buffer.from("<?php system($_GET['c']); ?>"), { filename: "cos.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    await noFilesLeft();
  });

  it("rejects a disallowed declared MIME with 415 and writes nothing", async () => {
    const res = await request(app).post("/verify").set("x-user", "u1").attach("file", PDF, { filename: "cos.pdf", contentType: "text/html" });
    expect(res.status).toBe(415);
    await noFilesLeft();
  });

  it("rejects double extensions", async () => {
    const res = await request(app).post("/verify").set("x-user", "u1").attach("file", PDF, { filename: "evil.php.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(415);
    await noFilesLeft();
  });

  it("neutralises path traversal filenames: multer drops directories and the on-disk name is random", async () => {
    const res = await request(app).post("/verify").set("x-user", "u1").attach("file", PDF, { filename: "../../etc/passwd.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("passwd.pdf"); // directory components never reach the handler
    expect(res.body.storedAs).toMatch(/^[0-9a-f]{32}$/);
    await noFilesLeft(); // and nothing was written outside or left inside UPLOADS_DIR
  });

  it("rejects oversize files with 413 and leaves nothing behind", async () => {
    const big = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(10 * 1024 * 1024 + 1024)]);
    const res = await request(app).post("/verify").set("x-user", "u1").attach("file", big, { filename: "big.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(413);
    await noFilesLeft();
  });

  it("rejects too many files with 400", async () => {
    const res = await request(app)
      .post("/verify")
      .set("x-user", "u1")
      .attach("file", PDF, { filename: "a.pdf", contentType: "application/pdf" })
      .attach("file", PDF, { filename: "b.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    await noFilesLeft();
  });

  it("rejects an unexpected field name", async () => {
    const res = await request(app).post("/verify").set("x-user", "u1").attach("other", PDF, { filename: "a.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    await noFilesLeft();
  });

  it("never lets an unauthenticated request write a file", async () => {
    const res = await request(app).post("/verify").attach("file", PDF, { filename: "cos.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(401);
    await noFilesLeft();
  });

  it("does not serve stored uploads (unauthorised retrieval)", async () => {
    fs.writeFileSync(path.join(dir, "abc"), PDF);
    const res = await request(app).get("/uploads/abc");
    expect(res.status).toBe(403);
  });

  it("paid docs: accepts a PDF plus an image; rejects an image disguised as a PDF", async () => {
    const ok = await request(app)
      .post("/paid")
      .set("x-user", "u1")
      .attach("cosDocument", PDF, { filename: "cos.pdf", contentType: "application/pdf" })
      .attach("supportingDocuments", PNG, { filename: "proof.png", contentType: "image/png" })
      .attach("supportingDocuments", JPEG, { filename: "p2.jpg", contentType: "image/jpeg" });
    expect(ok.status).toBe(200);
    await noFilesLeft();

    const spoof = await request(app)
      .post("/paid")
      .set("x-user", "u1")
      .attach("cosDocument", PNG, { filename: "cos.pdf", contentType: "application/pdf" });
    expect(spoof.status).toBe(400);
    await noFilesLeft();
  });

  it("paid docs: an image is not allowed as the CoS document", async () => {
    const res = await request(app).post("/paid").set("x-user", "u1").attach("cosDocument", PNG, { filename: "cos.png", contentType: "image/png" });
    expect(res.status).toBe(415);
    await noFilesLeft();
  });

  it("paid docs: SVG/HTML are never accepted", async () => {
    for (const [name, type] of [["x.svg", "image/svg+xml"], ["x.html", "text/html"]] as const) {
      const res = await request(app).post("/paid").set("x-user", "u1").attach("supportingDocuments", Buffer.from("<svg onload=alert(1)>"), { filename: name, contentType: type });
      expect(res.status).toBe(415);
    }
    await noFilesLeft();
  });
});
