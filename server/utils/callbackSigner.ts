import crypto from "crypto";
import dns from "dns/promises";
import { isIP } from "node:net";

const SIGNATURE_PREFIX = "sha256=";

export function signPayload(payload: string, secret: string): string {
  const digest = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${SIGNATURE_PREFIX}${digest}`;
}

export function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature.startsWith(SIGNATURE_PREFIX)) return false;

  const expected = signPayload(payload, secret);
  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(signature, "utf8");

  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

function isPrivateIpv4(ip: string): boolean {
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("127.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80")) return true;
  return false;
}

function isPrivateOrReservedIp(ip: string): boolean {
  if (ip === "169.254.169.254") return true; // cloud metadata endpoint
  if (isIP(ip) === 4) return isPrivateIpv4(ip);
  if (isIP(ip) === 6) return isPrivateIpv6(ip);
  return true;
}

export async function isSafeCallbackUrl(rawUrl: string): Promise<boolean> {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;

    const host = parsed.hostname.toLowerCase();
    if (host === "localhost") return false;

    if (host.endsWith(".local") || host.endsWith(".internal")) return false;

    if (isIP(host) > 0) {
      return !isPrivateOrReservedIp(host);
    }

    const resolved = await dns.lookup(host, { all: true });
    if (resolved.length === 0) return false;

    for (const entry of resolved) {
      if (isPrivateOrReservedIp(entry.address)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}
