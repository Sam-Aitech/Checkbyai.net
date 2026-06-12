/**
 * sponsorCsvColumns.test.ts
 *
 * Unit coverage for the shared GOV.UK register column resolver — the single
 * source of truth consumed by csvArchiver and csvFingerprintBuilder. A matcher
 * bug here silently misreads columns in BOTH parsers, so every known layout
 * and the precedence rules between predicates are pinned down explicitly.
 */
import { describe, it, expect } from "vitest";
import { resolveSponsorCsvColumns } from "../sponsorCsvColumns";

const LEGACY_HEADER = ["Organisation Name", "Town/City", "County", "Type & Rating", "Route"];

const CURRENT_HEADER = [
  "Sponsor Licence Number",
  "Organisation Name",
  "TierRating",
  "Migrant Classification",
  "Sponsor Status",
];

describe("resolveSponsorCsvColumns — legacy layout (pre May 2026)", () => {
  it("resolves every legacy column to its index", () => {
    const idx = resolveSponsorCsvColumns(LEGACY_HEADER);

    expect(idx.nameIdx).toBe(0);
    expect(idx.townIdx).toBe(1);
    expect(idx.countyIdx).toBe(2);
    expect(idx.typeIdx).toBe(3);
    expect(idx.routeIdx).toBe(4);
  });

  it("returns -1 for columns absent from the legacy layout", () => {
    const idx = resolveSponsorCsvColumns(LEGACY_HEADER);

    expect(idx.statusIdx).toBe(-1);
    expect(idx.licenceTypeIdx).toBe(-1);
    expect(idx.ratingIdx).toBe(-1);
    expect(idx.lastUpdatedIdx).toBe(-1);
    expect(idx.licenceNumberIdx).toBe(-1);
  });
});

describe("resolveSponsorCsvColumns — current layout (May 2026 onwards)", () => {
  it("resolves every current column to its index", () => {
    const idx = resolveSponsorCsvColumns(CURRENT_HEADER);

    expect(idx.licenceNumberIdx).toBe(0);
    expect(idx.nameIdx).toBe(1);
    expect(idx.typeIdx).toBe(2); // "TierRating" via the tier+rating fallback
    expect(idx.routeIdx).toBe(3); // "Migrant Classification" via the classification fallback
    expect(idx.statusIdx).toBe(4);
  });

  it("does NOT alias ratingIdx onto the TierRating column claimed by typeIdx", () => {
    // "tierrating" contains "rating" and lacks "type", so a naive
    // rating-and-not-type predicate matches it — pointing ratingIdx and
    // typeIdx at the same column. deriveSponsorRowEnums then double-parses
    // one column, and the derived rating is only correct by coincidence.
    // ratingIdx must return -1 here so callers fall back to typeRating.
    const idx = resolveSponsorCsvColumns(CURRENT_HEADER);

    expect(idx.ratingIdx).toBe(-1);
    expect(idx.ratingIdx).not.toBe(idx.typeIdx);
  });

  it("returns -1 for legacy-only columns", () => {
    const idx = resolveSponsorCsvColumns(CURRENT_HEADER);

    expect(idx.townIdx).toBe(-1);
    expect(idx.countyIdx).toBe(-1);
  });
});

describe("resolveSponsorCsvColumns — precedence and edge cases", () => {
  it("prefers the legacy predicate when a header matches both layouts", () => {
    const idx = resolveSponsorCsvColumns(["Organisation Name", "Type & Rating", "TierRating"]);

    expect(idx.typeIdx).toBe(1); // legacy "type & rating" wins over "tierrating"
  });

  it("resolves a standalone legacy Rating column distinct from Type & Rating", () => {
    const idx = resolveSponsorCsvColumns(["Organisation Name", "Type & Rating", "Rating"]);

    expect(idx.typeIdx).toBe(1);
    expect(idx.ratingIdx).toBe(2);
  });

  it("is case- and whitespace-insensitive", () => {
    const idx = resolveSponsorCsvColumns(["  ORGANISATION NAME  ", " tier rating ", "SPONSOR STATUS"]);

    expect(idx.nameIdx).toBe(0);
    expect(idx.typeIdx).toBe(1);
    expect(idx.statusIdx).toBe(2);
  });

  it("returns -1 across the board for an unrecognized header", () => {
    const idx = resolveSponsorCsvColumns(["Foo", "Bar", "Baz"]);

    expect(Object.values(idx).every((v) => v === -1)).toBe(true);
  });
});
