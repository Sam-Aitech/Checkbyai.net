// Ambient declarations for runtime dependencies that ship without bundled
// TypeScript types in this install (used by server/services/socketGateway.ts).
// Keeps `tsc --noEmit` clean without pulling extra @types packages.

declare module "cookie" {
  export function parse(str: string, options?: Record<string, unknown>): Record<string, string | undefined>;
  export function serialize(name: string, value: string, options?: Record<string, unknown>): string;
  const _default: { parse: typeof parse; serialize: typeof serialize };
  export default _default;
}

declare module "cookie-signature" {
  export function sign(value: string, secret: string): string;
  export function unsign(input: string, secret: string): string | false;
  const _default: { sign: typeof sign; unsign: typeof unsign };
  export default _default;
}
