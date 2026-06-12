/**
 * sponsorCsvNewFormat.test.ts
 *
 * Regression coverage for the GOV.UK register CSV schema change (May 2026).
 *
 * Old format: Organisation Name,Town/City,County,Type & Rating,Route
 * New format: Sponsor Licence Number,Organisation Name,TierRating,
 *             Migrant Classification,Sponsor Status
 *
 * Before the fix, every new-format row was rejected by Zod validation
 * (typeRating empty, licenceType underivable), which produced an empty
 * fingerprinted CSV. csvdiff then saw the whole register as deleted and
 * the state machine mass-removed all 143K sponsors (2026-05-20 incident).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

vi.mock("../adminAlert", () => ({
  sendAdminAlert: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../binaryRunner", () => ({
  qsvValidate: vi.fn().mockResolvedValue({ valid: true, recordCount: 0, errors: [] }),
  qsvCount: vi.fn().mockResolvedValue(150_000),
}));

import { parseCsvFile } from "../csvArchiver";
import { buildFingerprintedCsv, loadFingerprintSet } from "../csvFingerprintBuilder";
import { generateFingerprint } from "../sponsorListFetcher";
import { SponsorRowSchema, deriveSponsorRowEnums } from "../sponsorRowSchema";

const NEW_FORMAT_HEADER =
  "Sponsor Licence Number,Organisation Name,TierRating,Migrant Classification,Sponsor Status";

const NEW_FORMAT_ROWS = [
  `3DJDP93B8,"""K"" Line Energy Shipping (UK) Limited",Worker (A rating),Skilled Worker,Licensed and Fully Active`,
  `ABC123XYZ,Acme Global Ltd,Worker (A rating),Skilled Worker,Licensed and Fully Active`,
  `DEF456UVW,Beta Care Homes Ltd,Temporary Worker (A rating),Seasonal Worker,Licensed and Fully Active`,
].join("\n");

const OLD_FORMAT_CSV = [
  "Organisation Name,Town/City,County,Type & Rating,Route",
  "Acme Global Ltd,London,Greater London,Worker (A rating),Skilled Worker",
].join("\n");

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sponsor-csv-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeTmpCsv(name: string, content: string): string {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, "utf-8");
  return p;
}

describe("new-format GOV.UK CSV — parseCsvFile", () => {
  it("accepts all rows from the new 5-column register format", async () => {
    const csvPath = writeTmpCsv("new.csv", `${NEW_FORMAT_HEADER}\n${NEW_FORMAT_ROWS}`);
    const records = await parseCsvFile(csvPath);

    expect(records).toHaveLength(3);
    expect(records[1]).toMatchObject({
      organisationName: "Acme Global Ltd",
      typeRating: "Worker (A rating)",
      route: "Skilled Worker",
    });
  });

  it("still accepts the legacy 5-column format", async () => {
    const csvPath = writeTmpCsv("old.csv", OLD_FORMAT_CSV);
    const records = await parseCsvFile(csvPath);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      organisationName: "Acme Global Ltd",
      townCity: "London",
      typeRating: "Worker (A rating)",
      route: "Skilled Worker",
    });
  });
});

describe("new-format GOV.UK CSV — buildFingerprintedCsv", () => {
  it("writes a fingerprint for every new-format row", async () => {
    const csvPath = writeTmpCsv("new.csv", `${NEW_FORMAT_HEADER}\n${NEW_FORMAT_ROWS}`);
    const outPath = path.join(tmpDir, "new.fingerprinted.csv");

    await buildFingerprintedCsv(csvPath, outPath);
    const fpSet = await loadFingerprintSet(outPath);

    expect(fpSet.size).toBe(3);
    expect(fpSet.has(generateFingerprint("Acme Global Ltd", "", "Skilled Worker"))).toBe(true);
  });
});

describe("schema-change abort — mass row rejection must throw, never return a gutted result", () => {
  // Rows with an empty TierRating fail the typeRating Zod refine, so 100% of
  // rows are rejected — over the 20% SCHEMA_CHANGE_REJECTION_THRESHOLD. Before
  // the fix this path silently returned a near-empty result, which csvdiff
  // read as "entire register deleted" (the 2026-05-20 incident).
  const REJECTED_CSV = [
    NEW_FORMAT_HEADER,
    "ABC123XYZ,Acme Global Ltd,,Skilled Worker,Licensed and Fully Active",
    "DEF456UVW,Beta Care Homes Ltd,,Seasonal Worker,Licensed and Fully Active",
    "GHI789RST,Gamma Logistics Ltd,,Skilled Worker,Licensed and Fully Active",
  ].join("\n");

  it("parseCsvFile throws instead of returning a near-empty record set", async () => {
    const csvPath = writeTmpCsv("rejected.csv", REJECTED_CSV);

    await expect(parseCsvFile(csvPath)).rejects.toThrow(/Aborting.*rejected by validation/);
  });

  it("buildFingerprintedCsv throws and deletes the gutted output file", async () => {
    const csvPath = writeTmpCsv("rejected.csv", REJECTED_CSV);
    const outPath = path.join(tmpDir, "rejected.fingerprinted.csv");

    await expect(buildFingerprintedCsv(csvPath, outPath)).rejects.toThrow(
      /Aborting.*rejected by validation/,
    );
    // Leaving a near-empty fingerprinted CSV on disk is how the incident
    // propagated into the diff engine — the file must be gone.
    expect(fs.existsSync(outPath)).toBe(false);
  });
});

describe("new-format GOV.UK CSV — SponsorRowSchema derivation", () => {
  it("derives enums and validates a row mapped from the new format", () => {
    const derived = deriveSponsorRowEnums({
      statusRaw: "Licensed and Fully Active",
      ratingRaw: "Worker (A rating)",
      typeRating: "Worker (A rating)",
      licenceTypeRaw: null,
    });

    expect(derived.licenceStatus).toBe("Active");
    expect(derived.rating).toBe("A-RATING");
    expect(derived.licenceType).toBe("WORKER");

    const result = SponsorRowSchema.safeParse({
      organisationName: "Acme Global Ltd",
      townCity: null,
      county: null,
      typeRating: "Worker (A rating)",
      route: "Skilled Worker",
      ...derived,
    });
    expect(result.success).toBe(true);
  });
});
