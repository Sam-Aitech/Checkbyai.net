import { z } from "zod";
import { insertSponsorListSchema } from "@shared/schema";

const MAX_ORGANISATION_NAME_LENGTH = 255;
const MAX_LOCATION_LENGTH = 128;
const MAX_TYPE_RATING_LENGTH = 128;
const MAX_ROUTE_LENGTH = 160;

const SponsorBaseFromDbSchema = insertSponsorListSchema.pick({
  organisationName: true,
  townCity: true,
  county: true,
  typeRating: true,
  route: true,
});

export const SponsorLicenceStatusSchema = z.enum(["A-RATING", "B-RATING"]);
export const SponsorLicenceTypeSchema = z.enum(["WORKER", "TEMPORARY_WORKER"]);

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
    rating: SponsorLicenceStatusSchema,
  })
  .merge(SponsorRowPartialSchema)
  .strict();

export type SponsorRow = z.infer<typeof SponsorRowSchema>;

export function normalizeLicenceStatus(
  value: string | null | undefined,
): z.infer<typeof SponsorLicenceStatusSchema> | null {
  const source = (value ?? "").trim().toLowerCase();
  if (!source) return null;
  if (source.includes("a-rating") || source.includes("a rating")) return "A-RATING";
  if (source.includes("b-rating") || source.includes("b rating")) return "B-RATING";
  return null;
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

export function issueFieldName(issuePath: (string | number)[]): string {
  if (issuePath.length === 0) return "_row";
  const first = issuePath[0];
  return typeof first === "string" ? first : "_row";
}
