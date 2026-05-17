/**
 * uploadGuard.ts
 * Security utility: path-traversal guard for multer file uploads.
 *
 * All fs operations on uploaded files MUST go through sanitizeUploadPath()
 * before use. This prevents path-traversal attacks where a crafted filename
 * could escape the uploads/ directory (e.g. ../../etc/passwd).
 *
 * Closes CodeQL alerts #125-129 (High — Uncontrolled data used in path expression)
 */
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
    const resolved = path.resolve(rawPath);

  // Ensure the resolved path is strictly inside UPLOADS_DIR.
  // path.sep appended so that a dir named "uploads-evil" doesn't match.
  const isInside =
        resolved === UPLOADS_DIR ||
        resolved.startsWith(UPLOADS_DIR + path.sep);

  if (!isInside) {
        const err = new Error(
                `PATH_TRAVERSAL_BLOCKED: "${resolved}" is outside the permitted uploads directory (${UPLOADS_DIR}). ` +
                `This may indicate a path-traversal attack attempt.`,
              );
        (err as any).statusCode = 400;
        throw err;
  }

  return resolved;
}
