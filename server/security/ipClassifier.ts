import { isIP } from "node:net";

/**
 * Numeric IP classification for the outbound request policy.
 *
 * Addresses are parsed to integers and compared against CIDR ranges rather than
 * matched by string prefix, so expanded IPv6 forms, IPv4-mapped IPv6, NAT64 and
 * 6to4 wrappers cannot smuggle a private IPv4 destination past the check.
 */

type Cidr4 = readonly [base: string, bits: number, reason: string];

const BLOCKED_V4: readonly Cidr4[] = [
  ["0.0.0.0", 8, "unspecified"],
  ["10.0.0.0", 8, "private"],
  ["100.64.0.0", 10, "carrier_grade_nat"],
  ["127.0.0.0", 8, "loopback"],
  ["169.254.0.0", 16, "link_local_or_metadata"],
  ["172.16.0.0", 12, "private"],
  ["192.0.0.0", 24, "ietf_protocol"],
  ["192.0.2.0", 24, "documentation"],
  ["192.88.99.0", 24, "6to4_relay"],
  ["192.168.0.0", 16, "private"],
  ["198.18.0.0", 15, "benchmark"],
  ["198.51.100.0", 24, "documentation"],
  ["203.0.113.0", 24, "documentation"],
  ["224.0.0.0", 4, "multicast"],
  ["240.0.0.0", 4, "reserved_or_broadcast"],
];

export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out;
}

function inCidr4(value: number, base: string, bits: number): boolean {
  const baseInt = ipv4ToInt(base) as number;
  const size = 2 ** (32 - bits);
  return Math.floor(value / size) === Math.floor(baseInt / size);
}

function classifyV4(ip: string): string | null {
  const value = ipv4ToInt(ip);
  if (value === null) return "malformed";
  for (const [base, bits, reason] of BLOCKED_V4) {
    if (inCidr4(value, base, bits)) return reason;
  }
  return null;
}

/** Parse an IPv6 literal into eight 16-bit groups. Returns null if malformed. */
export function parseIpv6(input: string): number[] | null {
  let ip = input.toLowerCase();
  const zone = ip.indexOf("%");
  if (zone !== -1) ip = ip.slice(0, zone);
  if (isIP(ip) !== 6) return null;

  // Convert an embedded dotted IPv4 tail into two hex groups.
  const lastColon = ip.lastIndexOf(":");
  const tail = ip.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = ipv4ToInt(tail);
    if (v4 === null) return null;
    const hi = Math.floor(v4 / 65536).toString(16);
    const lo = (v4 % 65536).toString(16);
    ip = `${ip.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null;
    groups = [...head, ...new Array<string>(missing).fill("0"), ...rest];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(Number.parseInt(g, 16));
  }
  return out;
}

function v4FromGroups(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

function startsWith(groups: number[], prefix: number[]): boolean {
  return prefix.every((v, i) => groups[i] === v);
}

function classifyV6(ip: string): string | null {
  const g = parseIpv6(ip);
  if (!g) return "malformed";

  // ::ffff:a.b.c.d (IPv4-mapped) and ::a.b.c.d (deprecated IPv4-compatible)
  if (startsWith(g, [0, 0, 0, 0, 0, 0xffff])) {
    return classifyV4(v4FromGroups(g[6], g[7])) ?? "ipv4_mapped";
  }
  // 64:ff9b::/96 NAT64: judge the embedded IPv4 address
  if (startsWith(g, [0x64, 0xff9b, 0, 0, 0, 0])) {
    return classifyV4(v4FromGroups(g[6], g[7])) ?? "nat64";
  }
  // 2002::/16 6to4: embedded IPv4 sits in groups 1-2
  if (g[0] === 0x2002) {
    return classifyV4(v4FromGroups(g[1], g[2])) ?? "6to4";
  }

  if (g.every((x) => x === 0)) return "unspecified";
  if (startsWith(g, [0, 0, 0, 0, 0, 0, 0]) && g[7] === 1) return "loopback";

  // Only global unicast (2000::/3) can be a legitimate public destination.
  if ((g[0] & 0xe000) !== 0x2000) {
    if ((g[0] & 0xfe00) === 0xfc00) return "unique_local";
    if ((g[0] & 0xffc0) === 0xfe80) return "link_local";
    if ((g[0] & 0xff00) === 0xff00) return "multicast";
    return "reserved";
  }
  if (g[0] === 0x2001 && g[1] === 0x0db8) return "documentation";
  if (g[0] === 0x2001 && g[1] === 0) return "teredo";
  if (g[0] === 0x3fff && (g[1] & 0xf000) === 0) return "documentation";
  return null;
}

/**
 * Returns a reason code when the address must not be contacted, or null when
 * it is a public unicast address. Anything that is not an IP literal is blocked.
 */
export function classifyIp(rawIp: string): string | null {
  const ip = rawIp.replace(/^\[|\]$/g, "");
  const family = isIP(ip.split("%")[0]);
  if (family === 4) return classifyV4(ip);
  if (family === 6) return classifyV6(ip);
  return "not_an_ip";
}
