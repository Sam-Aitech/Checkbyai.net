/**
 * Safe CSV cell encoding.
 *
 * 1. Formula-injection guard (OWASP "CSV Injection"): spreadsheets evaluate a cell whose first
 *    significant character is = + - @ (and tab / carriage return). Such values are prefixed with a
 *    single quote so they are stored and shown as text; the original characters are preserved.
 *    "Significant" means after any leading whitespace, because some importers trim before parsing.
 * 2. RFC 4180 quoting for cells containing a comma, quote or line break.
 */

const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@"]);

export function neutraliseFormula(value: string): string {
  const firstSignificant = value.trimStart().charAt(0);
  const startsWithControl = value.startsWith("\t") || value.startsWith("\r");
  if (FORMULA_TRIGGERS.has(firstSignificant) || startsWithControl) return `'${value}`;
  return value;
}

export function csvCell(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  const value = neutraliseFormula(String(raw));
  if (value === "") return "";
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",") + "\r\n";
}
