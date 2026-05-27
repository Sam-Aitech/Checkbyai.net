import { z } from "zod";
import { match } from "ts-pattern";
import { insertSponsorListSchema } from "@shared/schema";
import { logger } from "./logger";

// Why ts-pattern: ETL enum normalization must fail loudly when GOV.UK enum values
// drift; exhaustive pattern matching keeps branch handling explicit and safer.
// Priority 5 enum source of truth: shared/schema.ts sponsor_licence_timeline.licenceStatus.

const log = logger.child({ module: "SponsorRowSchema" });

const MAX_ORGANISATION_NAME_LENGTH = 255;
const MAX_LOCATION_LENGTH = 128;
const MAX_TYPE_RATING_LENGTH = 128;
const MAX_ROUTE_LENGTH = 160;
export const SCHEMA_CHANGE_REJECTION_THRESHOLD = 0.2;

const SponsorBaseFromDbSchema = insertSponsorListSchema.pick({
  organisationName: true,
  townCity: true,
  county: true,
  typeRating: true,
  route: true,
});

// Priority 5 canonical licence status values (timeline domain).
export const SponsorLicenceStatusSchema = z.enum(["Active", "Suspended", "Revoked", "Surrendered"], {
  required_error: "licenceStatus is required",
});
// Gov.uk sponsor feed rating values.
export const SponsorRatingSchema = z.enum(["A-RATING", "B-RATING"], {
  required_error: "rating is required",
});
// Gov.uk sponsor feed licence-type values for this ETL domain.
export const SponsorLicenceTypeSchema = z.enum(["WORKER", "TEMPORARY_WORKER"], {
  required_error: "licenceType is required",
});

const LastUpdatedSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid lastUpdated date string");

export const SponsorRowPartialSchema = z
  .object({
    townCity: SponsorBaseFromDbSchema.shape.townCity
      .nullable()
      .optional()
      .transform((v) => (typeof v === "string" ? v.trim() : v))
      .refine((v) => v == null || v.length <= MAX_LOCATION_LENGTH, {
        message: `townCity must be <= ${MAX_LOCATION_LENGTH} chars`,
      }),
    county: SponsorBaseFromDbSchema.shape.county
      .nullable()
      .optional()
      .transform((v) => (typeof v === "string" ? v.trim() : v))
      .refine((v) => v == null || v.length <= MAX_LOCATION_LENGTH, {
        message: `county must be <= ${MAX_LOCATION_LENGTH} chars`,
      }),
    route: SponsorBaseFromDbSchema.shape.route
      .nullable()
      .optional()
      .transform((v) => (typeof v === "string" ? v.trim() : v))
      .refine((v) => v == null || v.length <= MAX_ROUTE_LENGTH, {
        message: `route must be <= ${MAX_ROUTE_LENGTH} chars`,
      }),
    lastUpdated: LastUpdatedSchema.nullable().optional(),
  })
  .strict();

export const SponsorRowSchema = z
  .object({
    organisationName: SponsorBaseFromDbSchema.shape.organisationName
      .trim()
      .min(1, "organisationName is required")
      .max(MAX_ORGANISATION_NAME_LENGTH, `organisationName must be <= ${MAX_ORGANISATION_NAME_LENGTH} chars`),
    typeRating: SponsorBaseFromDbSchema.shape.typeRating
      .nullable()
      .transform((v) => (v ?? "").trim())
      .refine((v) => v.length > 0, "typeRating is required")
      .refine((v) => v.length <= MAX_TYPE_RATING_LENGTH, `typeRating must be <= ${MAX_TYPE_RATING_LENGTH} chars`),
    licenceStatus: SponsorLicenceStatusSchema,
    licenceType: SponsorLicenceTypeSchema,
    // Kept as a separate field to support explicit rating-level analytics/tests.
    rating: SponsorRatingSchema,
  })
  .merge(SponsorRowPartialSchema)
  .strict();

export type SponsorRow = z.infer<typeof SponsorRowSchema>;

export function normalizeLicenceStatus(
  value: string | null | undefined,
): z.infer<typeof SponsorLicenceStatusSchema> | null {
  const source = (value ?? "").trim().toLowerCase();
  if (!source) return null;
  return match(source)
    .when(
      (s) => s.includes("active"),
      () => "Active" as const,
    )
    .when(
      (s) => s.includes("suspended"),
      () => "Suspended" as const,
    )
    .when(
      (s) => s.includes("revoked"),
      () => "Revoked" as const,
    )
    .when(
      (s) => s.includes("surrendered"),
      () => "Surrendered" as const,
    )
    .otherwise((unknownStatus) => {
      log.warn({ unknownStatus }, "Unrecognized sponsor licence status value during ETL normalization");
      return null;
    });
}

export function normalizeSponsorRating(
  value: string | null | undefined,
): z.infer<typeof SponsorRatingSchema> | null {
  const source = (value ?? "").trim().toLowerCase();
  if (!source) return null;
  return match(source)
    .when(
      (s) => s.includes("a-rating") || s.includes("a rating"),
      () => "A-RATING" as const,
    )
    .when(
      (s) => s.includes("b-rating") || s.includes("b rating"),
      () => "B-RATING" as const,
    )
    .otherwise((unknownRating) => {
      log.warn({ unknownRating }, "Unrecognized sponsor rating value during ETL normalization");
      return null;
    });
}

export function normalizeLicenceType(
  value: string | null | undefined,
): z.infer<typeof SponsorLicenceTypeSchema> | null {
  const source = (value ?? "").trim().toLowerCase();
  if (!source) return null;
  if (source.includes("temporary worker")) return "TEMPORARY_WORKER";
  if (source.includes("worker")) return "WORKER";
  return null;
}

export function deriveSponsorRowEnums(input: {
  statusRaw?: string | null;
  ratingRaw?: string | null;
  typeRating?: string | null;
  licenceTypeRaw?: string | null;
}): {
  licenceStatus: z.infer<typeof SponsorLicenceStatusSchema> | undefined;
  rating: z.infer<typeof SponsorRatingSchema> | undefined;
  licenceType: z.infer<typeof SponsorLicenceTypeSchema> | undefined;
} {
  const licenceStatus =
    normalizeLicenceStatus(input.statusRaw) ??
    normalizeLicenceStatus(input.ratingRaw) ??
    normalizeLicenceStatus(input.typeRating);
  // Rating remains strictly rating-derived; licenceStatus is a separate enum
  // domain (Active/Suspended/Revoked/Surrendered) and is intentionally not used
  // as a fallback to avoid cross-domain coercion.
  const rating =
    normalizeSponsorRating(input.ratingRaw) ??
    normalizeSponsorRating(input.typeRating);
  const licenceType =
    normalizeLicenceType(input.licenceTypeRaw) ??
    normalizeLicenceType(input.typeRating);

  return {
    licenceStatus: licenceStatus ?? undefined,
    rating: rating ?? undefined,
    licenceType: licenceType ?? undefined,
  };
}

export function issueFieldName(issuePath: (string | number)[]): string {
  if (issuePath.length === 0) return "_row";
  const first = issuePath[0];
  return typeof first === "string" ? first : "_row";
}

export interface SponsorRowValidationSummary {
  totalRowsProcessed: number;
  rowsAccepted: number;
  rowsRejected: number;
  rejectionReasons: Record<string, number>;
}

export function shouldTriggerSchemaChangeAlert(
  summary: SponsorRowValidationSummary,
): boolean {
  if (summary.totalRowsProcessed <= 0) return false;
  return summary.rowsRejected / summary.totalRowsProcessed > SCHEMA_CHANGE_REJECTION_THRESHOLD;
}

export function buildSchemaChangeAlertHtml(
  contextLabel: string,
  summary: SponsorRowValidationSummary,
): string {
  const safeContextLabel = contextLabel
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const rejectionRatePct = summary.totalRowsProcessed > 0
    ? ((summary.rowsRejected / summary.totalRowsProcessed) * 100).toFixed(2)
    : "0.00";
  return `<p>More than 20% of sponsor CSV rows were rejected by Zod validation (${safeContextLabel}).</p>
       <ul>
         <li><strong>Total rows processed:</strong> ${summary.totalRowsProcessed.toLocaleString()}</li>
         <li><strong>Rows accepted:</strong> ${summary.rowsAccepted.toLocaleString()}</li>
         <li><strong>Rows rejected:</strong> ${summary.rowsRejected.toLocaleString()} (${rejectionRatePct}%)</li>
       </ul>
       <p><strong>Rejection reasons by field:</strong></p>
       <pre>${JSON.stringify(summary.rejectionReasons, null, 2)}</pre>`;
}
