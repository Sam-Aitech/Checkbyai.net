import { describe, expect, it } from "vitest";
import {
  SponsorRowSchema,
  normalizeLicenceStatus,
  normalizeSponsorRating,
  deriveSponsorRowEnums,
} from "../sponsorRowSchema";

const ALL_LICENCE_STATUSES = ["Active", "Suspended", "Revoked", "Surrendered"] as const;

describe("SponsorRowSchema", () => {
  it("accepts a valid sponsor row", () => {
    const result = SponsorRowSchema.safeParse({
      organisationName: "Acme Global Ltd",
      townCity: "London",
      county: "Greater London",
      typeRating: "Worker (A rating)",
      route: "Skilled Worker",
      licenceStatus: "Active",
      licenceType: "WORKER",
      rating: "A-RATING",
      lastUpdated: "2026-05-18",
    });

    expect(result.success).toBe(true);
  });

  it("rejects rows with missing required fields", () => {
    const result = SponsorRowSchema.safeParse({
      organisationName: "",
      townCity: "London",
      county: "Greater London",
      typeRating: "Worker (A rating)",
      route: "Skilled Worker",
      licenceStatus: "Active",
      licenceType: "WORKER",
      rating: "A-RATING",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "organisationName")).toBe(true);
    }
  });

  it("accepts every canonical licence status enum value", () => {
    for (const status of ALL_LICENCE_STATUSES) {
      const result = SponsorRowSchema.safeParse({
        organisationName: "Acme Global Ltd",
        townCity: "London",
        county: "Greater London",
        typeRating: "Worker (A rating)",
        route: "Skilled Worker",
        licenceStatus: status,
        licenceType: "WORKER",
        rating: "A-RATING",
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects rows with invalid licence status enums", () => {
    const result = SponsorRowSchema.safeParse({
      organisationName: "Acme Global Ltd",
      townCity: "London",
      county: "Greater London",
      typeRating: "Worker (A rating)",
      route: "Skilled Worker",
      licenceStatus: "ACTIVE",
      licenceType: "WORKER",
      rating: "A-RATING",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "licenceStatus")).toBe(true);
    }
  });

  it("rejects rows with malformed date strings", () => {
    const result = SponsorRowSchema.safeParse({
      organisationName: "Acme Global Ltd",
      townCity: "London",
      county: "Greater London",
      typeRating: "Worker (A rating)",
      route: "Skilled Worker",
      licenceStatus: "Active",
      licenceType: "WORKER",
      rating: "A-RATING",
      lastUpdated: "not-a-date",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "lastUpdated")).toBe(true);
    }
  });

  it("normalizes each canonical licence status value from raw text", () => {
    expect(normalizeLicenceStatus("active")).toBe("Active");
    expect(normalizeLicenceStatus("SUSPENDED")).toBe("Suspended");
    expect(normalizeLicenceStatus("revoked")).toBe("Revoked");
    expect(normalizeLicenceStatus("surrendered")).toBe("Surrendered");
  });

  it("normalizes rating values independently from licence status", () => {
    expect(normalizeSponsorRating("Worker (A rating)")).toBe("A-RATING");
    expect(normalizeSponsorRating("Temporary Worker (B-rating)")).toBe("B-RATING");
    expect(normalizeSponsorRating("unknown")).toBeNull();
  });

  it("derives status/rating/type enums from mixed raw fields", () => {
    const derived = deriveSponsorRowEnums({
      statusRaw: "Suspended",
      ratingRaw: "A rating",
      typeRating: "Worker (A rating)",
      licenceTypeRaw: "Temporary worker",
    });

    expect(derived.licenceStatus).toBe("Suspended");
    expect(derived.rating).toBe("A-RATING");
    expect(derived.licenceType).toBe("TEMPORARY_WORKER");
  });
});
