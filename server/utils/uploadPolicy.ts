import * as fs from "fs";
import * as path from "path";
import multer from "multer";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ApiError } from "../lib/apiError";
import { logger } from "./logger";
import { UPLOADS_DIR, toConfinedFsPath } from "./uploadGuard";

/**
 * Upload hardening shared by every multer route.
 *
 * Per use case: explicit extension + declared MIME allowlist, real file-signature check after
 * the bytes are on disk, size/count/field limits, safe display filename. On-disk names are
 * always multer's random, extension-less names inside UPLOADS_DIR (outside any served path).
 */

export type FileKind = "pdf" | "jpeg" | "png";

interface AllowedType {
  mimes: readonly string[];
  kind: FileKind;
}

export interface UploadProfile {
  name: string;
  /** Extension (lowercase, with dot) -> allowed declared MIME types + required signature. */
  allowed: Readonly<Record<string, AllowedType>>;
  /** Optional narrower allowlist for specific multipart field names. */
  fieldAllowed?: Readonly<Record<string, readonly string[]>>;
  maxFileBytes: number;
  maxFiles: number;
  maxFields: number;
  maxFieldBytes: number;
}

const PDF: AllowedType = { mimes: ["application/pdf"], kind: "pdf" };

export const UPLOAD_PROFILES = {
  /** POST /api/verify and admin PDF tools: a single PDF. */
  singlePdf: {
    name: "singlePdf",
    allowed: { ".pdf": PDF },
    maxFileBytes: 10 * 1024 * 1024,
    maxFiles: 1,
    maxFields: 5,
    maxFieldBytes: 8 * 1024,
  },
  /** POST /api/paid/submit/:id: one CoS PDF plus up to five supporting documents. */
  paidDocs: {
    name: "paidDocs",
    allowed: {
      ".pdf": PDF,
      ".jpg": { mimes: ["image/jpeg"], kind: "jpeg" },
      ".jpeg": { mimes: ["image/jpeg"], kind: "jpeg" },
      ".png": { mimes: ["image/png"], kind: "png" },
    },
    fieldAllowed: {
      cosDocument: [".pdf"],
      supportingDocuments: [".pdf", ".jpg", ".jpeg", ".png"],
    },
    maxFileBytes: 10 * 1024 * 1024,
    maxFiles: 6,
    maxFields: 20,
    maxFieldBytes: 50 * 1024,
  },
} as const satisfies Record<string, UploadProfile>;

/** Executable/script/markup extensions that must not appear anywhere in a multi-dot filename. */
const DANGEROUS_INNER_EXTENSIONS = new Set([
  "php", "phtml", "php3", "php4", "php5", "phar", "asp", "aspx", "jsp", "jspx", "cgi", "pl", "py", "rb", "sh", "bash",
  "bat", "cmd", "com", "exe", "dll", "scr", "msi", "jar", "js", "mjs", "vbs", "ps1", "html", "htm", "xhtml", "svg", "xml",
  "swf", "hta", "lnk",
]);

const MAX_DISPLAY_NAME = 120;

/** Own-key lookups without dynamic property access on client-influenced keys. */
function allowedType(profile: UploadProfile, ext: string): AllowedType | undefined {
  return Object.entries(profile.allowed).find(([key]) => key === ext)?.[1];
}

function allowedExtsForField(profile: UploadProfile, fieldName: string | undefined): readonly string[] | undefined {
  if (!fieldName || !profile.fieldAllowed) return undefined;
  return Object.entries(profile.fieldAllowed).find(([key]) => key === fieldName)?.[1];
}

/** Sanitised, length-capped name that is safe to store and render. Never used as an on-disk path. */
export function toDisplayFilename(original: string): string {
  const base = path.basename(String(original).replace(/\\/g, "/")).normalize("NFC");
  const cleaned = base.replace(/[\x00-\x1f\x7f<>:"|?*]/g, "_").trim();
  return cleaned.slice(0, MAX_DISPLAY_NAME) || "upload";
}

/**
 * Validates the client-supplied filename against the profile. Returns the lowercase extension.
 * Throws ApiError(415/400) so a rejected upload never reaches the disk.
 */
export function validateUploadFilename(original: unknown, profile: UploadProfile, fieldName?: string): string {
  if (typeof original !== "string" || original.trim() === "") throw new ApiError(400, "Upload filename is missing.");
  if (/[\x00-\x1f\x7f]/.test(original) || /[\\/]/.test(original) || original.includes("..")) {
    throw new ApiError(400, "Upload filename contains forbidden characters.");
  }
  const name = original.trim();
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : "";
  const allowedForField = allowedExtsForField(profile, fieldName);
  if (!ext || !allowedType(profile, ext) || (allowedForField && !allowedForField.includes(ext))) {
    throw new ApiError(415, "File type is not allowed.");
  }
  // Double extensions such as evil.php.pdf: every inner segment must be non-executable.
  const inner = name.slice(0, dot).split(".").slice(1).map((s) => s.toLowerCase());
  if (inner.some((seg) => DANGEROUS_INNER_EXTENSIONS.has(seg))) {
    throw new ApiError(415, "File type is not allowed.");
  }
  return ext;
}

export function createUploader(profile: UploadProfile) {
  return multer({
    dest: UPLOADS_DIR,
    limits: {
      fileSize: profile.maxFileBytes,
      files: profile.maxFiles,
      fields: profile.maxFields,
      fieldSize: profile.maxFieldBytes,
      fieldNameSize: 100,
      parts: profile.maxFiles + profile.maxFields,
    },
    fileFilter: (_req, file, cb) => {
      try {
        const ext = validateUploadFilename(file.originalname, profile, file.fieldname);
        if (!allowedType(profile, ext)?.mimes.includes(file.mimetype)) {
          throw new ApiError(415, "File type is not allowed.");
        }
        cb(null, true);
      } catch (err) {
        cb(err as Error);
      }
    },
  });
}

/** Signature sniffing: the first bytes of the file decide its kind, never the client's headers. */
export function detectFileKind(head: Buffer): FileKind | null {
  if (head.length >= 5 && head.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (
    head.length >= 8 &&
    head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "png";
  }
  return null;
}

async function readHead(filePath: string): Promise<Buffer> {
  // Path is re-derived inside UPLOADS_DIR from the basename only (toConfinedFsPath).
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const handle = await fs.promises.open(toConfinedFsPath(filePath), "r");
  try {
    const buf = Buffer.alloc(8);
    const { bytesRead } = await handle.read(buf, 0, 8, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export function uploadedFiles(req: Request): Express.Multer.File[] {
  const out: Express.Multer.File[] = [];
  if (req.file) out.push(req.file);
  const files = req.files;
  if (Array.isArray(files)) out.push(...files);
  else if (files) for (const list of Object.values(files)) out.push(...list);
  return out;
}

/** Verifies every uploaded file's real signature matches the extension and profile. */
export async function verifyUploadedFiles(req: Request, profile: UploadProfile): Promise<void> {
  for (const file of uploadedFiles(req)) {
    const ext = validateUploadFilename(file.originalname, profile, file.fieldname);
    const expected = allowedType(profile, ext)?.kind;
    let actual: FileKind | null;
    try {
      actual = detectFileKind(await readHead(file.path));
    } catch {
      throw new ApiError(400, "Uploaded file could not be read.");
    }
    if (!expected || actual !== expected) throw new ApiError(400, "Uploaded file content does not match its type.");
  }
}

export async function removeUploadedFiles(req: Request): Promise<void> {
  await Promise.all(
    uploadedFiles(req)
      // multer can abort mid-stream and leave file objects without a stored path
      .filter((f) => typeof f.path === "string" && f.path.length > 0)
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- confined to UPLOADS_DIR by toConfinedFsPath
      .map((f) => fs.promises.unlink(toConfinedFsPath(f.path)).catch(() => undefined)),
  );
}

/** Removes any previously stored upload paths (replacement/deletion), ignoring missing files. */
export async function removeStoredUploads(paths: Array<string | null | undefined>): Promise<void> {
  await Promise.all(
    paths
      .filter((p): p is string => typeof p === "string" && p.length > 0)
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- confined to UPLOADS_DIR by toConfinedFsPath
      .map((p) => fs.promises.unlink(toConfinedFsPath(p)).catch(() => undefined)),
  );
}

/** Maps multer/limit failures to the application's ApiError conventions (never a 500). */
export function mapUploadError(err: unknown): unknown {
  if (err instanceof ApiError) return err;
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        return new ApiError(413, "File is too large.");
      case "LIMIT_FILE_COUNT":
      case "LIMIT_PART_COUNT":
      case "LIMIT_UNEXPECTED_FILE":
        return new ApiError(400, "Unexpected or too many files.");
      default:
        return new ApiError(400, "Invalid upload.");
    }
  }
  return err;
}

/** Wraps a multer middleware so its errors are mapped and never become 500s. */
export function guardedUpload(middleware: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    middleware(req, res, (err?: unknown) => {
      if (err) {
        const reason = err instanceof multer.MulterError ? err.code : err instanceof Error ? err.message : "unknown";
        logger.warn({ reason, route: req.path }, "Upload rejected");
        void removeUploadedFiles(req);
        return next(mapUploadError(err));
      }
      next();
    });
  };
}

/** Runs the handler, then always deletes the request's temporary upload files. */
export function withUploadCleanup<T>(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<T>,
): (req: Request, res: Response, next: NextFunction) => Promise<T> {
  return async (req, res, next) => {
    try {
      return await handler(req, res, next);
    } finally {
      await removeUploadedFiles(req);
    }
  };
}

/** Ready-to-mount middleware. Mount AFTER authentication so anonymous requests never reach multer. */
export const uploadSinglePdf: RequestHandler = guardedUpload(createUploader(UPLOAD_PROFILES.singlePdf).single("file"));

export const uploadPaidDocs: RequestHandler = guardedUpload(
  createUploader(UPLOAD_PROFILES.paidDocs).fields([
    { name: "cosDocument", maxCount: 1 },
    { name: "supportingDocuments", maxCount: 5 },
  ]),
);
