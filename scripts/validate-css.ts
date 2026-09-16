import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

interface CssSyntaxError extends Error {
  reason?: string;
  line?: number;
  column?: number;
}

/**
 * Parse a stylesheet and throw a file/position-aware error when its syntax is
 * malformed. PostCSS is intentionally used only as a parser here; transforms
 * belong to the Vite/Tailwind build.
 */
export function validateCss(css: string, filename: string): void {
  try {
    postcss.parse(css, { from: filename });
  } catch (error) {
    const syntaxError = error as CssSyntaxError;
    const location =
      syntaxError.line !== undefined && syntaxError.column !== undefined
        ? ` at line ${syntaxError.line}, column ${syntaxError.column}`
        : "";
    const reason = syntaxError.reason ?? syntaxError.message;

    throw new Error(`Invalid CSS in ${filename}${location}: ${reason}`, {
      cause: error,
    });
  }
}

export function validateCssFile(filename: string): void {
  const css = fs.readFileSync(filename, "utf8");
  validateCss(css, filename);
}

function run(): void {
  const filename = process.argv[2];
  if (!filename) {
    console.error("Usage: tsx scripts/validate-css.ts <stylesheet>");
    process.exitCode = 2;
    return;
  }

  try {
    validateCssFile(filename);
    console.log(`CSS validation passed: ${filename}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const scriptPath = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] ?? "") === path.resolve(scriptPath)) {
  run();
}