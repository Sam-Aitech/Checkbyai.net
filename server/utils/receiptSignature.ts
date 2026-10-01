import crypto from "node:crypto";

/**
 * Receipts are portable (anyone holding the id can show one), so each carries an HMAC-SHA256
 * signature over the canonical server-side record. The signing key is a purpose-bound subkey
 * of DIGEST_SIGNING_KEY. Without the key a receipt cannot be forged, and a verify endpoint lets
 * a third party check a presented receipt against the stored record.
 */

export const RECEIPT_SIGNATURE_VERSION = 1;

export interface ReceiptFields {
  receiptId: string;
  documentHash: string;
  result: string;
  confidence: number;
  verifiedAt: Date | string | null;
}

function subkey(): Buffer | null {
  const master = process.env.DIGEST_SIGNING_KEY;
  if (!master) return null;
  return crypto.createHmac("sha256", master).update("checkbyai:receipt-signature:v1").digest();
}

/** Timezone- and locale-independent canonical form (the old hash interpolated a Date's toString). */
export function canonicalReceipt(fields: ReceiptFields): string {
  const verifiedAt = fields.verifiedAt instanceof Date ? fields.verifiedAt.toISOString() : new Date(fields.verifiedAt ?? 0).toISOString();
  return [
    `v${RECEIPT_SIGNATURE_VERSION}`,
    fields.receiptId,
    fields.documentHash,
    fields.result,
    String(Math.trunc(fields.confidence)),
    verifiedAt,
  ].join("|");
}

/** Returns null when no signing key is configured (the receipt is then served unsigned). */
export function signReceipt(fields: ReceiptFields): string | null {
  const key = subkey();
  if (!key) return null;
  return crypto.createHmac("sha256", key).update(canonicalReceipt(fields)).digest("hex");
}

export function verifyReceiptSignature(fields: ReceiptFields, presented: unknown): boolean {
  if (typeof presented !== "string" || !/^[0-9a-f]{64}$/.test(presented)) return false;
  const expected = signReceipt(fields);
  if (!expected) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(presented, "hex"));
}
