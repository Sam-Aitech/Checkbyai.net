import { describe, it, expect } from "vitest";
import {
  normalizeName,
  namePrefilterToken,
  stripToSqlComparable,
} from "../sponsorListFetcher";

/**
 * `GET /api/watches` backfills a missing fingerprint by comparing
 * normalizeName(watch) against normalizeName(sponsor_canonical.current_name).
 * To avoid loading all ~140k canonical rows it prefilters in SQL with
 *
 *   regexp_replace(lower(current_name), '[^a-z0-9_ ]', '', 'g') LIKE '%token%'
 *
 * That prefilter is only correct if the token is guaranteed to appear in the
 * stripped name. If it can ever fail, watches silently stop resolving — the
 * sponsor looks unmonitored with no error surfaced anywhere.
 */
describe("name prefilter invariant", () => {
  const REAL_WORLD_NAMES = [
    "Smith & Jones Ltd",
    "O'Brien Ltd",
    "O’Neill LLP", // curly apostrophe
    "ACME Ltd.",
    "Smith Ltd Jones", // suffix in the middle
    "AB-CD Limited",
    "St. Mary's Hospital NHS Trust",
    "Café Rouge Ltd", // non-ASCII
    "Müller UK Ltd",
    "J.P. Morgan (UK) PLC",
    "3M United Kingdom PLC",
    "A & B Co",
    "Tesco PLC",
    "The Big Group Holdings Ltd",
    "Ann-Marie's Care Homes Limited",
    "Zeta_Corp",
    "X Y Z Ltd",
  ];

  it.each(REAL_WORLD_NAMES)(
    "token of %j appears in the SQL-stripped name",
    (raw) => {
      const token = namePrefilterToken(raw);
      expect(token).not.toBeNull();
      expect(stripToSqlComparable(raw)).toContain(token as string);
    },
  );

  it("returns null when a name normalizes to nothing, so callers skip prefiltering", () => {
    // All-suffix and punctuation-only names have no safe pattern. Callers must
    // fall back to an unfiltered read rather than dropping the watch.
    expect(namePrefilterToken("Ltd")).toBeNull();
    expect(namePrefilterToken("Limited Ltd Co")).toBeNull();
    expect(namePrefilterToken("!!!")).toBeNull();
    expect(namePrefilterToken("")).toBeNull();
  });

  it("rejects the naive whole-name prefilter that silently dropped matches", () => {
    // Regression guard: matching the entire normalized name against the raw
    // name looks equivalent but fails whenever normalizeName deletes a
    // character. Kept as an explicit expectation so nobody reintroduces it.
    const raw = "Smith & Jones Ltd";
    expect(raw.toLowerCase()).not.toContain(normalizeName(raw));

    const token = namePrefilterToken(raw);
    expect(stripToSqlComparable(raw)).toContain(token as string);
  });

  it("holds for randomly generated names with punctuation and suffixes", () => {
    const words = ["smith", "jones", "acme", "north", "care", "9tech", "a"];
    const punct = ["&", "'", "-", ".", "(", ")", ",", "’", "/"];
    const suffixes = ["Ltd", "Limited", "PLC", "Co", "Group", "Holdings", "UK"];
    const pick = <T,>(xs: T[], i: number) => xs[i % xs.length];

    for (let i = 0; i < 500; i++) {
      const raw = [
        pick(words, i),
        pick(punct, i * 3 + 1),
        pick(words, i * 7 + 2),
        pick(suffixes, i * 5),
      ].join(" ");

      const token = namePrefilterToken(raw);
      if (token === null) continue; // caller falls back to a full read
      expect(stripToSqlComparable(raw)).toContain(token);
    }
  });
});
