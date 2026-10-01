import { describe, it, expect } from "vitest";
import { z, ZodError } from "zod";
import type { Request, Response } from "express";
import { validateBody, validateQuery } from "../validate";
import { ApiError } from "../apiError";
import { SponsorLicenceStatusSchema, SponsorRatingSchema, issueFieldName } from "../../utils/sponsorRowSchema";

const schema = z.object({ name: z.string().min(2), age: z.coerce.number().int() });

const runBody = (req: Partial<Request>) => () =>
  validateBody(schema)(req as Request, {} as Response, () => undefined);

describe("validateBody / validateQuery (zod 4 issues API)", () => {
  it("throws a 400 ApiError naming the first failing path", () => {
    const fn = runBody({ body: { name: "x", age: "3" } });
    expect(fn).toThrow(ApiError);
    try {
      fn();
    } catch (e) {
      expect((e as ApiError).statusCode).toBe(400);
      expect((e as ApiError).message.startsWith("name: ")).toBe(true);
    }
  });

  it("replaces req.body with the parsed (coerced) data", () => {
    const req: any = { body: { name: "abc", age: "7" } };
    validateBody(schema)(req as Request, {} as Response, () => undefined);
    expect(req.body).toEqual({ name: "abc", age: 7 });
  });

  it("validates and replaces req.query", () => {
    const req: any = { query: { name: "abc", age: "7" } };
    validateQuery(schema)(req as Request, {} as Response, () => undefined);
    expect(req.query).toEqual({ name: "abc", age: 7 });
  });

  it("ZodError exposes .issues with joinable paths and messages", () => {
    const result = schema.safeParse({ name: "x" });
    expect(result.success).toBe(false);
    const error = (result as { error: ZodError }).error;
    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.issues.every((i) => typeof i.message === "string" && Array.isArray(i.path))).toBe(true);
  });
});

describe("sponsor enum schemas keep their 'required' message", () => {
  it("uses the custom message when the value is missing", () => {
    const status = SponsorLicenceStatusSchema.safeParse(undefined);
    const rating = SponsorRatingSchema.safeParse(undefined);
    expect(status.success).toBe(false);
    expect(rating.success).toBe(false);
    expect((status as any).error.issues[0].message).toBe("licenceStatus is required");
    expect((rating as any).error.issues[0].message).toBe("rating is required");
  });

  it("uses the default enum message (not the 'required' one) for a wrong value", () => {
    const status = SponsorLicenceStatusSchema.safeParse("Bogus");
    expect(status.success).toBe(false);
    expect((status as any).error.issues[0].message).not.toBe("licenceStatus is required");
  });

  it("accepts valid values", () => {
    expect(SponsorLicenceStatusSchema.parse("Active")).toBe("Active");
    expect(SponsorRatingSchema.parse("A-RATING")).toBe("A-RATING");
  });
});

describe("issueFieldName", () => {
  it("returns the first string path segment, else _row", () => {
    expect(issueFieldName(["organisationName", 0])).toBe("organisationName");
    expect(issueFieldName([])).toBe("_row");
    expect(issueFieldName([0, "x"])).toBe("_row");
    expect(issueFieldName([Symbol("s")])).toBe("_row");
  });
});
