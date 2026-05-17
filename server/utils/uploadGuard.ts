import path from "path";

export function sanitizeUploadPath(rawPath: string): string {
  const resolved = path.resolve(rawPath);
  const uploadsDir = path.resolve("uploads");
  if (!resolved.startsWith(uploadsDir)) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}
