/** Safely parse an integer from a URL parameter. Returns null if invalid. */
export function parseIntParam(value: string): number | null {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : parsed;
}
