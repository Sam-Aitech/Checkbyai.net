import type { PaidSubmission } from "@shared/schema";

/**
 * Fields a paying customer may see about their own submission. Everything else on the row
 * (server file paths, assignee, Stripe identifiers, expert/analysis internals) stays server-side.
 */
export interface OwnerSubmissionView {
  id: number;
  email: string;
  packageType: string;
  paymentStatus: string | null;
  reviewStatus: string | null;
  createdAt: Date | string | null;
}

export function toOwnerSubmissionView(s: PaidSubmission): OwnerSubmissionView {
  return {
    id: s.id,
    email: s.email,
    packageType: s.packageType,
    paymentStatus: s.paymentStatus,
    reviewStatus: s.reviewStatus,
    createdAt: s.createdAt,
  };
}

/** Parse a positive integer route id; returns null for NaN, floats, negatives or junk. */
export function parseSubmissionId(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^\d{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}
