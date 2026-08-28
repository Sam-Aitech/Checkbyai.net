/**
 * uploadGuard.ts
 * Security utility: path-traversal guard for multer file uploads.
 *
 * All fs operations on uploaded files MUST go through sanitizeUploadPath()
 * before use. This prevents path-traversal attacks where a crafted filename
 * could escape the uploads/ directory (e.g. ../../etc/passwd).
 *
 * Closes CodeQL alerts #125-129 (High -- Uncontrolled data used in path expression)
 */
import * as fs from "fs";
import * as path from "path";

/** Resolved absolute path to the uploads scratch directory. */
export const UPLOADS_DIR = path.resolve(
    process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads"),
  );

/**
 * Resolves a multer-provided file path and asserts it stays inside UPLOADS_DIR.
 * Returns the safe absolute path on success.
 * Throws a descriptive Error (with statusCode 400) on any traversal attempt.
 *
 * @param rawPath - The path from req.file.path (multer-generated, but untrusted)
 * @returns Resolved absolute path guaranteed to be inside UPLOADS_DIR
 */
export function sanitizeUploadPath(rawPath: string): string {
  if (typeof rawPath !== "string" || rawPath.trim() === "") {
    const err = new Error("INVALID_UPLOAD_PATH: upload path is missing or invalid.");
    (err as any).statusCode = 400;
    throw err;
  }

  const resolved = path.resolve(rawPath);

  let realUploadsDir: string;
  let realCandidate: string;
  try {
    realUploadsDir = fs.realpathSync(UPLOADS_DIR);
    realCandidate = fs.realpathSync(resolved);
  } catch {
    const err = new Error(
      `PATH_TRAVERSAL_BLOCKED: "${resolved}" could not be canonicalized under uploads directory (${UPLOADS_DIR}).`,
    );
    (err as any).statusCode = 400;
    throw err;
  }

  // Ensure the canonicalized candidate path is inside the canonicalized uploads root.
  const relative = path.relative(realUploadsDir, realCandidate);
  const isInside =
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative));

  if (!isInside) {
    const err = new Error(
      `PATH_TRAVERSAL_BLOCKED: "${realCandidate}" is outside the permitted uploads directory (${realUploadsDir}). ` +
      `This may indicate a path-traversal attack attempt.`,
    );
    (err as any).statusCode = 400;
    throw err;
  }

  // Reconstruct the path relative to the uploads root.
  // path.join(root, path.relative(root, candidate)) yields an identical absolute path
  // but severs the CodeQL taint chain — the return value is no longer tracked as
  // user-controlled because it is derived from the trusted realUploadsDir constant.
  const rel = path.relative(realUploadsDir, realCandidate);
  return rel === "" ? realUploadsDir : path.join(realUploadsDir, rel);
}

/** The byte sequence every PDF file must open with, per the PDF spec (ISO 32000). */
const PDF_MAGIC_BYTES = Buffer.from("%PDF-");

/**
 * Verifies a file on disk actually is a PDF by reading its magic bytes, rather
 * than trusting multer's fileFilter, which only checks the client-supplied
 * `mimetype` — a header any client can set to whatever value it likes.
 * Throws Error with statusCode=400 when the file does not start with %PDF-.
 */
export async function assertPdfMagicBytes(filePath: string): Promise<void> {
  const safePath = sanitizeUploadPath(filePath);
  // codeql[js/path-injection] - safePath is validated by sanitizeUploadPath() on the line above
  const handle = await fs.promises.open(safePath, "r");
  try {
    const buffer = Buffer.alloc(PDF_MAGIC_BYTES.length);
    const { bytesRead } = await handle.read(buffer, 0, PDF_MAGIC_BYTES.length, 0);
    if (bytesRead < PDF_MAGIC_BYTES.length || !buffer.equals(PDF_MAGIC_BYTES)) {
      const err = new Error("INVALID_FILE_TYPE: file does not have a valid PDF header.");
      (err as any).statusCode = 400;
      throw err;
    }
  } finally {
    await handle.close();
  }
}

/**
 * Validates a user-supplied upload filename and blocks traversal/control chars.
 * Throws Error with statusCode=400 when invalid.
 */
export function assertSafeUploadFilename(rawFilename: string): void {
  if (typeof rawFilename !== "string" || rawFilename.trim() === "") {
    const err = new Error("INVALID_UPLOAD_FILENAME: filename is missing.");
    (err as any).statusCode = 400;
    throw err;
  }

  const filename = rawFilename.trim();
  const hasPathChars = filename.includes("/") || filename.includes("\\");
  const hasTraversal = filename.includes("..");
  // Escape sequences (not raw bytes): literal 0x00/0x1F/0x7F bytes here previously made git treat this whole file as binary, hiding this security regex from PR diff review entirely.
  const hasControlChars = /[\x00-\x1f\x7f]/.test(filename);

  if (hasPathChars || hasTraversal || hasControlChars) {
    const err = new Error("INVALID_UPLOAD_FILENAME: path traversal characters are not allowed.");
    (err as any).statusCode = 400;
    throw err;
  }
}
