import dns from "node:dns/promises";
import https from "node:https";
import http from "node:http";
import type { LookupFunction } from "node:net";
import { isIP } from "node:net";
import { logger } from "../utils/logger";
import { classifyIp } from "./ipClassifier";

/**
 * Single outbound request policy for every user- or admin-influenced URL
 * (job callbacks, customer webhooks). Do not call fetch() on such URLs directly.
 *
 * Guarantees:
 *  - HTTPS only, no embedded credentials, port allowlist (443 by default).
 *  - Optional exact-host allowlist (OUTBOUND_ALLOWED_HOSTS), never suffix based.
 *  - A and AAAA are both resolved; ANY blocked address rejects the destination.
 *  - The connection is pinned to the validated address list through a custom
 *    `lookup`, so no second, attacker-controlled DNS resolution happens.
 *  - Redirects are never followed unless explicitly enabled, and every hop
 *    re-runs the whole sequence.
 *  - Bounded connect/total time and response size.
 */

const log = logger.child({ module: "OutboundPolicy" });

export type OutboundBlockReason =
  | "invalid_url"
  | "scheme_not_allowed"
  | "credentials_not_allowed"
  | "port_not_allowed"
  | "host_not_allowed"
  | "host_not_allowlisted"
  | "dns_failed"
  | "dns_empty"
  | "ip_blocked"
  | "redirect_not_allowed"
  | "too_many_redirects";

export class OutboundBlockedError extends Error {
  constructor(
    public readonly reason: OutboundBlockReason,
    public readonly host: string,
    public readonly detail?: string,
  ) {
    super(`OUTBOUND_BLOCKED:${reason}`);
    this.name = "OutboundBlockedError";
  }
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface OutboundDeps {
  /** Resolve A and AAAA. Injected in tests. */
  resolve: (host: string) => Promise<ResolvedAddress[]>;
  /** Transport. Injected in tests. */
  request: typeof https.request;
}

export interface OutboundOptions {
  allowedPorts?: number[];
  allowedHosts?: string[];
  maxRedirects?: number;
  connectTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxResponseBytes?: number;
  dnsTimeoutMs?: number;
}

export interface OutboundResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  truncated: boolean;
}

const DEFAULTS = {
  allowedPorts: [443],
  maxRedirects: 0,
  connectTimeoutMs: 5_000,
  totalTimeoutMs: 10_000,
  maxResponseBytes: 16 * 1024,
  dnsTimeoutMs: 3_000,
} as const;

/** Local-development escape hatch. Cannot be active in production. */
export function isLocalDevOutboundEnabled(): boolean {
  return process.env.OUTBOUND_ALLOW_LOCAL_DEV === "1" && process.env.NODE_ENV === "development";
}

/** Called at boot: refuse to start in production with the dev exception set. */
export function assertOutboundConfig(): void {
  if (process.env.OUTBOUND_ALLOW_LOCAL_DEV === "1" && process.env.NODE_ENV !== "development") {
    throw new Error("OUTBOUND_ALLOW_LOCAL_DEV may only be set when NODE_ENV=development");
  }
}

function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function envPorts(): number[] | undefined {
  const list = envList("OUTBOUND_ALLOWED_PORTS").map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 65536);
  return list.length ? list : undefined;
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

const defaultDeps: OutboundDeps = {
  resolve: async (host) => {
    const rows = await dns.lookup(host, { all: true, verbatim: true });
    return rows.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
  },
  request: https.request,
};

export interface ValidatedUrl {
  url: URL;
  host: string;
  port: number;
}

/** Scheme, credentials, port, hostname and allowlist checks. No network I/O. */
export function validateOutboundUrl(raw: string, options: OutboundOptions = {}): ValidatedUrl {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OutboundBlockedError("invalid_url", "");
  }
  const devLocal = isLocalDevOutboundEnabled();
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (url.protocol !== "https:" && !(devLocal && url.protocol === "http:")) {
    throw new OutboundBlockedError("scheme_not_allowed", host);
  }
  if (url.username || url.password) throw new OutboundBlockedError("credentials_not_allowed", host);

  const defaultPort = url.protocol === "https:" ? 443 : 80;
  const port = url.port ? Number(url.port) : defaultPort;
  const ports = options.allowedPorts ?? envPorts() ?? [...DEFAULTS.allowedPorts];
  if (!devLocal && !ports.includes(port)) throw new OutboundBlockedError("port_not_allowed", host);

  if (!host || host.endsWith(".") || /\s/.test(host)) throw new OutboundBlockedError("host_not_allowed", host);
  if (!devLocal) {
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
      throw new OutboundBlockedError("host_not_allowed", host);
    }
  }

  const allowlist = options.allowedHosts ?? envList("OUTBOUND_ALLOWED_HOSTS");
  if (allowlist.length > 0 && !allowlist.includes(host)) {
    throw new OutboundBlockedError("host_not_allowlisted", host);
  }
  return { url, host, port };
}

/** Resolve and classify every address. Rejects if any single address is prohibited. */
export async function resolvePublicAddresses(
  host: string,
  deps: OutboundDeps,
  dnsTimeoutMs: number = DEFAULTS.dnsTimeoutMs,
): Promise<ResolvedAddress[]> {
  const devLocal = isLocalDevOutboundEnabled();
  let addresses: ResolvedAddress[];
  if (isIP(host)) {
    addresses = [{ address: host, family: isIP(host) === 6 ? 6 : 4 }];
  } else {
    try {
      addresses = await withTimeout(deps.resolve(host), dnsTimeoutMs, () => new Error("dns timeout"));
    } catch {
      throw new OutboundBlockedError("dns_failed", host);
    }
  }
  if (addresses.length === 0) throw new OutboundBlockedError("dns_empty", host);
  for (const a of addresses) {
    const reason = classifyIp(a.address);
    if (reason && !devLocal) throw new OutboundBlockedError("ip_blocked", host, reason);
  }
  return addresses;
}

/** Validate URL + DNS without connecting. For save-time checks. */
export async function assertSafeOutboundUrl(
  raw: string,
  options: OutboundOptions = {},
  deps: OutboundDeps = defaultDeps,
): Promise<void> {
  try {
    const { host } = validateOutboundUrl(raw, options);
    await resolvePublicAddresses(host, deps, options.dnsTimeoutMs);
  } catch (err) {
    logBlocked(err);
    throw err;
  }
}

export async function isSafeOutboundUrl(raw: string, options: OutboundOptions = {}, deps?: OutboundDeps): Promise<boolean> {
  try {
    await assertSafeOutboundUrl(raw, options, deps);
    return true;
  } catch (err) {
    if (err instanceof OutboundBlockedError) return false;
    throw err;
  }
}

function logBlocked(err: unknown): void {
  if (err instanceof OutboundBlockedError) {
    // Host and reason only: never the path, query, userinfo, headers or body.
    log.warn({ reason: err.reason, host: err.host, detail: err.detail }, "Outbound request blocked");
  }
}

function pinnedLookup(addresses: ResolvedAddress[]): LookupFunction {
  return ((_hostname: string, options: { all?: boolean }, cb: (...args: unknown[]) => void) => {
    if (options?.all) cb(null, addresses.map((a) => ({ address: a.address, family: a.family })));
    else cb(null, addresses[0].address, addresses[0].family);
  }) as unknown as LookupFunction;
}

function singleRequest(
  target: ValidatedUrl,
  addresses: ResolvedAddress[],
  init: { method: string; headers: Record<string, string>; body?: string },
  opts: Required<Pick<OutboundOptions, "connectTimeoutMs" | "totalTimeoutMs" | "maxResponseBytes">>,
  deps: OutboundDeps,
): Promise<OutboundResponse> {
  const devHttp = target.url.protocol === "http:";
  const transport = (devHttp ? http.request : deps.request) as typeof https.request;
  return new Promise<OutboundResponse>((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(total);
      fn();
    };
    const req = transport(
      {
        protocol: target.url.protocol,
        hostname: target.host,
        port: target.port,
        path: `${target.url.pathname}${target.url.search}`,
        method: init.method,
        headers: init.body !== undefined
          ? { ...init.headers, "Content-Length": String(Buffer.byteLength(init.body)) }
          : init.headers,
        lookup: pinnedLookup(addresses), // connection can only reach validated IPs
        servername: isIP(target.host) ? undefined : target.host,
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > opts.maxResponseBytes) {
            truncated = true;
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        const finish = () =>
          done(() =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks).toString("utf8"),
              truncated,
            }),
          );
        res.on("end", finish);
        res.on("close", finish);
        res.on("error", (e) => done(() => reject(e)));
      },
    );
    const total = setTimeout(() => {
      req.destroy(new Error("outbound request timed out"));
    }, opts.totalTimeoutMs);
    req.setTimeout(opts.connectTimeoutMs, () => req.destroy(new Error("outbound connect timed out")));
    req.on("error", (e) => done(() => reject(e)));
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}

/**
 * The only function that should send HTTP requests to user-influenced URLs.
 * Throws OutboundBlockedError when policy rejects the destination.
 */
export async function safeOutboundRequest(
  rawUrl: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  options: OutboundOptions = {},
  deps: OutboundDeps = defaultDeps,
): Promise<OutboundResponse> {
  const maxRedirects = options.maxRedirects ?? DEFAULTS.maxRedirects;
  const limits = {
    connectTimeoutMs: options.connectTimeoutMs ?? DEFAULTS.connectTimeoutMs,
    totalTimeoutMs: options.totalTimeoutMs ?? DEFAULTS.totalTimeoutMs,
    maxResponseBytes: options.maxResponseBytes ?? DEFAULTS.maxResponseBytes,
  };
  let current = rawUrl;
  for (let hop = 0; ; hop++) {
    let response: OutboundResponse;
    try {
      const target = validateOutboundUrl(current, options);
      const addresses = await resolvePublicAddresses(target.host, deps, options.dnsTimeoutMs);
      response = await singleRequest(
        target,
        addresses,
        { method: init.method ?? "POST", headers: init.headers ?? {}, body: init.body },
        limits,
        deps,
      );
    } catch (err) {
      logBlocked(err);
      throw err;
    }
    const location = response.headers.location;
    if (response.status >= 300 && response.status < 400 && location) {
      if (maxRedirects === 0) return response; // surfaced as a non-2xx, never followed
      if (hop >= maxRedirects) {
        const err = new OutboundBlockedError("too_many_redirects", safeHost(current));
        logBlocked(err);
        throw err;
      }
      try {
        current = new URL(location, current).toString();
      } catch {
        const err = new OutboundBlockedError("invalid_url", safeHost(current));
        logBlocked(err);
        throw err;
      }
      continue;
    }
    return response;
  }
}

function safeHost(raw: string): string {
  try {
    return new URL(raw).hostname;
  } catch {
    return "";
  }
}
