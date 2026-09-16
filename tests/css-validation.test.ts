import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateCss, validateCssFile } from "../scripts/validate-css";

const stylesheetPath = path.resolve("client/src/index.css");

describe("CSS validation", () => {
  it("accepts the main stylesheet", () => {
    expect(() => validateCssFile(stylesheetPath)).not.toThrow();
  });

  it.each([
    [
      "an unclosed comment",
      "/* Decorative tokens were accidentally left unterminated\n.card { color: red; }",
      "Unclosed comment",
    ],
    [
      "prose after a misplaced comment delimiter",
      "*/ Decorative dividers/card borders: a visible step up from the previous\nnear-invisible hsl(235,20%,90%) (1.23:1 vs --background), though still\nintentionally softer than --input/--border-strong below, which carry\nactual functional meaning and are held to the 3:1 non-text UI threshold. */",
      "Unknown word",
    ],
    [
      "an unclosed rule",
      ".card { color: red;",
      "Unclosed block",
    ],
    [
      "an invalid declaration",
      ".card { color red; }",
      "Unknown word",
    ],
  ])("rejects %s", (_description, css, reason) => {
    expect(() => validateCss(css, "fixture.css")).toThrow(
      `Invalid CSS in fixture.css at line 1, column`,
    );
    expect(() => validateCss(css, "fixture.css")).toThrow(reason);
  });

  it("reads the stylesheet as UTF-8 before parsing", () => {
    expect(fs.readFileSync(stylesheetPath, "utf8")).toContain("@layer base");
  });
});