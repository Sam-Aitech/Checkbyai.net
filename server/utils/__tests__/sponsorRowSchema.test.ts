import { describe, expect, it } from "vitest";
import { SponsorRowSchema } from "../sponsorRowSchema";

describe("SponsorRowSchema", () => {
  it("accepts a valid sponsor row", () => {
    const result = SponsorRowSchema.safeParse({
      organisationName: "Acme Global Ltd",
      townCity: "London",
      county: "Greater London",
      typeRating: "Worker (A rating)",
      route: "Skilled Worker",
      licenceStatus: "A-RATING",
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
      licenceStatus: "A-RATING",
      licenceType: "WORKER",
      rating: "A-RATING",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "organisationName")).toBe(true);
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
      licenceStatus: "A-RATING",
      licenceType: "WORKER",
      rating: "A-RATING",
      lastUpdated: "not-a-date",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "lastUpdated")).toBe(true);
    }
  });
});
