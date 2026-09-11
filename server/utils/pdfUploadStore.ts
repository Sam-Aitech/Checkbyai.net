import { eq, lt } from "drizzle-orm";
import { db } from "../db";
import { pdfVerifyUploads } from "@shared/schema";

/**
 * Durable handoff for queued PDF verification jobs. The API route stores the
 * uploaded bytes here and enqueues only the row id — the BullMQ worker fetches
 * the bytes from Postgres instead of a local disk path, so processing works
 * correctly when the API and worker run as independently scaled processes
 * (a worker instance is not guaranteed to share a filesystem with whichever
 * instance received the original upload).
 */

export async function storePdfUpload(
  userId: string,
  fileBytes: Buffer,
  originalname: string,
): Promise<string> {
  const [row] = await db
    .insert(pdfVerifyUploads)
    .values({ userId, fileBytes, originalname })
    .returning({ id: pdfVerifyUploads.id });
  return row.id;
}

export async function fetchPdfUpload(
  id: string,
): Promise<{ fileBytes: Buffer; originalname: string } | undefined> {
  const [row] = await db
    .select({ fileBytes: pdfVerifyUploads.fileBytes, originalname: pdfVerifyUploads.originalname })
    .from(pdfVerifyUploads)
    .where(eq(pdfVerifyUploads.id, id))
    .limit(1);
  return row;
}

export async function deletePdfUpload(id: string): Promise<void> {
  try {
    await db.delete(pdfVerifyUploads).where(eq(pdfVerifyUploads.id, id));
  } catch { /* best-effort — the sweep below is the backstop */ }
}

/** Safety-net sweep for rows that were never cleaned up by the worker
 * (crash, bug, etc.) — see server/utils/scheduler.ts. Returns the count
 * deleted. */
export async function sweepStalePdfUploads(maxAgeMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const deleted = await db
    .delete(pdfVerifyUploads)
    .where(lt(pdfVerifyUploads.createdAt, cutoff))
    .returning({ id: pdfVerifyUploads.id });
  return deleted.length;
}
