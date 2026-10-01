import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyIp } from "../ipClassifier";
import {
  OutboundBlockedError,
  assertOutboundConfig,
  isSafeOutboundUrl,
  safeOutboundRequest,
  validateOutboundUrl,
  type OutboundDeps,
  type ResolvedAddress,
} from "../outboundPolicy";

const PUBLIC_V4 = "93.184.216.34";

function v4(address: string): ResolvedAddress {
  return { address, family: 4 };
}
function v6(address: string): ResolvedAddress {
  return { address, family: 6 };
}

interface FakeReply {
  status: number;
  headers?: Record<string, string>;
  body?: string;
}

/** Fake https.request: records the IP the pinned `lookup` hands to the socket layer. */
function makeTransport(replies: FakeReply[]) {
  const connectedTo: string[] = [];
  const requests: Array<{ hostname: string; path: string; method: string }> = [];
  let call = 0;
  const request = vi.fn((options: any, cb: (res: any) => void) => {
    const req: any = new EventEmitter();
    req.setTimeout = vi.fn();
    req.destroy = vi.fn((e?: Error) => e && req.emit("error", e));
    req.write = vi.fn();
    req.end = () => {
      options.lookup(options.hostname, {}, (_err: unknown, address: string) => connectedTo.push(address));
      requests.push({ hostname: options.hostname, path: options.path, method: options.method });
      const reply = replies[Math.min(call++, replies.length - 1)];
      const res: any = new EventEmitter();
      res.statusCode = reply.status;
      res.headers = reply.headers ?? {};
      res.destroy = vi.fn();
      cb(res);
      if (reply.body) res.emit("data", Buffer.from(reply.body));
      res.emit("end");
    };
    return req;
  });
  return { request: request as unknown as OutboundDeps["request"], connectedTo, requests, spy: request };
}

function deps(resolve: OutboundDeps["resolve"], transport: ReturnType<typeof makeTransport>): OutboundDeps {
  return { resolve, request: transport.request };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("classifyIp", () => {
  it.each([
    ["127.0.0.1", "loopback"],
    ["127.255.255.254", "loopback"],
    ["0.0.0.0", "unspecified"],
    ["10.0.0.1", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["192.168.1.1", "private"],
    ["100.64.0.1", "carrier_grade_nat"],
    ["100.127.255.255", "carrier_grade_nat"],
    ["169.254.169.254", "link_local_or_metadata"],
    ["224.0.0.1", "multicast"],
    ["239.255.255.255", "multicast"],
    ["255.255.255.255", "reserved_or_broadcast"],
    ["240.0.0.1", "reserved_or_broadcast"],
    ["198.18.0.1", "benchmark"],
    ["::", "unspecified"],
    ["::1", "loopback"],
    ["0:0:0:0:0:0:0:1", "loopback"],
    ["fc00::1", "unique_local"],
    ["fd00:ec2::254", "unique_local"],
    ["fe80::1", "link_local"],
    ["febf::1", "link_local"],
    ["ff02::1", "multicast"],
    ["::ffff:127.0.0.1", "loopback"],
    ["::ffff:7f00:1", "loopback"],
    ["::ffff:10.0.0.1", "private"],
    ["::ffff:169.254.169.254", "link_local_or_metadata"],
    ["64:ff9b::7f00:1", "loopback"],
    ["2002:7f00:1::1", "loopback"],
    ["2001:db8::1", "documentation"],
    // Wrapped forms are blocked even when the embedded IPv4 is public: a real AAAA never needs them.
    ["::ffff:8.8.8.8", "ipv4_mapped"],
    ["64:ff9b::808:808", "nat64"],
  ])("blocks %s", (ip, reason) => {
    expect(classifyIp(ip)).toBe(reason);
  });

  it.each([
    "93.184.216.34",
    "8.8.8.8",
    "172.15.255.255",
    "172.32.0.1",
    "100.63.255.255",
    "100.128.0.1",
    "169.253.1.1",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ])("allows public address %s", (ip) => {
    expect(classifyIp(ip)).toBeNull();
  });

  it("blocks anything that is not an IP literal", () => {
    expect(classifyIp("example.com")).toBe("not_an_ip");
  });
});

describe("validateOutboundUrl", () => {
  it.each([
    ["http://hooks.example.com/x", "scheme_not_allowed"],
    ["ftp://hooks.example.com/x", "scheme_not_allowed"],
    ["https://user:pw@hooks.example.com/x", "credentials_not_allowed"],
    ["https://user@hooks.example.com/x", "credentials_not_allowed"],
    ["https://hooks.example.com:8443/x", "port_not_allowed"],
    ["https://hooks.example.com:22/x", "port_not_allowed"],
    ["https://localhost/x", "host_not_allowed"],
    ["https://app.localhost/x", "host_not_allowed"],
    ["https://svc.internal/x", "host_not_allowed"],
    ["https://printer.local/x", "host_not_allowed"],
    ["https://hooks.example.com./x", "host_not_allowed"],
    ["not a url", "invalid_url"],
    ["", "invalid_url"],
  ])("rejects %s", (url, reason) => {
    expect(() => validateOutboundUrl(url)).toThrow(`OUTBOUND_BLOCKED:${reason}`);
  });

  it("accepts a normal HTTPS URL on 443", () => {
    expect(validateOutboundUrl("https://hooks.example.com/path?q=1").host).toBe("hooks.example.com");
  });

  it("enforces an exact-host allowlist and ignores suffix tricks", () => {
    const allowedHosts = ["hooks.example.com"];
    expect(validateOutboundUrl("https://hooks.example.com/x", { allowedHosts }).host).toBe("hooks.example.com");
    expect(() => validateOutboundUrl("https://evil-hooks.example.com/x", { allowedHosts })).toThrow();
    expect(() => validateOutboundUrl("https://hooks.example.com.evil.net/x", { allowedHosts })).toThrow();
    expect(() => validateOutboundUrl("https://sub.hooks.example.com/x", { allowedHosts })).toThrow();
  });

  it("reads the allowlist from OUTBOUND_ALLOWED_HOSTS", () => {
    vi.stubEnv("OUTBOUND_ALLOWED_HOSTS", "a.example.com, B.example.com");
    expect(validateOutboundUrl("https://b.example.com/x").host).toBe("b.example.com");
    expect(() => validateOutboundUrl("https://c.example.com/x")).toThrow();
  });

  it("does not honour the dev exception outside NODE_ENV=development", () => {
    vi.stubEnv("OUTBOUND_ALLOW_LOCAL_DEV", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => validateOutboundUrl("http://127.0.0.1:3000/x")).toThrow();
    expect(() => assertOutboundConfig()).toThrow(/NODE_ENV=development/);
  });

  it("honours the dev exception only in development", () => {
    vi.stubEnv("OUTBOUND_ALLOW_LOCAL_DEV", "1");
    vi.stubEnv("NODE_ENV", "development");
    expect(validateOutboundUrl("http://127.0.0.1:3000/x").port).toBe(3000);
    expect(() => assertOutboundConfig()).not.toThrow();
  });
});

describe("safeOutboundRequest: destination classes", () => {
  const blockedHosts: Array<[string, string]> = [
    ["https://127.0.0.1/h", "loopback v4"],
    ["https://[::1]/h", "loopback v6"],
    ["https://10.1.2.3/h", "private 10/8"],
    ["https://172.16.5.5/h", "private 172.16/12"],
    ["https://192.168.0.9/h", "private 192.168/16"],
    ["https://100.64.1.1/h", "cgnat"],
    ["https://169.254.169.254/latest/meta-data", "aws/gcp metadata"],
    ["https://[fd00:ec2::254]/latest/meta-data", "aws ipv6 metadata"],
    ["https://[fc00::1]/h", "unique local"],
    ["https://[fe80::1]/h", "link local v6"],
    ["https://[::ffff:127.0.0.1]/h", "ipv4-mapped loopback"],
    ["https://[::ffff:a9fe:a9fe]/h", "ipv4-mapped metadata"],
    ["https://224.0.0.1/h", "multicast"],
    ["https://255.255.255.255/h", "broadcast"],
    ["https://0.0.0.0/h", "unspecified"],
    ["https://2130706433/h", "decimal loopback (normalised by URL parser)"],
    ["https://0x7f000001/h", "hex loopback (normalised by URL parser)"],
  ];

  it.each(blockedHosts)("blocks %s (%s) without any connection", async (url) => {
    const transport = makeTransport([{ status: 200 }]);
    const resolve = vi.fn(async () => [v4(PUBLIC_V4)]);
    await expect(safeOutboundRequest(url, {}, {}, deps(resolve, transport))).rejects.toBeInstanceOf(OutboundBlockedError);
    expect(transport.spy).not.toHaveBeenCalled();
  });

  it("blocks a hostname that resolves to a private address", async () => {
    const transport = makeTransport([{ status: 200 }]);
    const resolve = vi.fn(async () => [v4("10.0.0.5")]);
    await expect(
      safeOutboundRequest("https://hooks.example.com/h", {}, {}, deps(resolve, transport)),
    ).rejects.toMatchObject({ reason: "ip_blocked" });
    expect(transport.spy).not.toHaveBeenCalled();
  });

  it("blocks a hostname such as 127.0.0.1.nip.io that resolves to loopback", async () => {
    const transport = makeTransport([{ status: 200 }]);
    const resolve = vi.fn(async () => [v4("127.0.0.1")]);
    await expect(
      safeOutboundRequest("https://127.0.0.1.nip.io/h", {}, {}, deps(resolve, transport)),
    ).rejects.toMatchObject({ reason: "ip_blocked" });
  });

  it("blocks when A is public but AAAA is prohibited (mixed answer)", async () => {
    const transport = makeTransport([{ status: 200 }]);
    const resolve = vi.fn(async () => [v4(PUBLIC_V4), v6("::1")]);
    await expect(
      safeOutboundRequest("https://hooks.example.com/h", {}, {}, deps(resolve, transport)),
    ).rejects.toMatchObject({ reason: "ip_blocked", detail: "loopback" });
    expect(transport.spy).not.toHaveBeenCalled();
  });

  it("blocks when AAAA is an IPv4-mapped metadata address", async () => {
    const transport = makeTransport([{ status: 200 }]);
    const resolve = vi.fn(async () => [v4(PUBLIC_V4), v6("::ffff:169.254.169.254")]);
    await expect(
      safeOutboundRequest("https://hooks.example.com/h", {}, {}, deps(resolve, transport)),
    ).rejects.toBeInstanceOf(OutboundBlockedError);
  });

  it("fails closed on DNS errors and empty answers", async () => {
    const transport = makeTransport([{ status: 200 }]);
    await expect(
      safeOutboundRequest("https://hooks.example.com/h", {}, {}, deps(async () => { throw new Error("ENOTFOUND"); }, transport)),
    ).rejects.toMatchObject({ reason: "dns_failed" });
    await expect(
      safeOutboundRequest("https://hooks.example.com/h", {}, {}, deps(async () => [], transport)),
    ).rejects.toMatchObject({ reason: "dns_empty" });
    expect(transport.spy).not.toHaveBeenCalled();
  });

  it("times out a hanging resolver", async () => {
    const transport = makeTransport([{ status: 200 }]);
    const resolve = () => new Promise<ResolvedAddress[]>(() => undefined);
    await expect(
      safeOutboundRequest("https://hooks.example.com/h", {}, { dnsTimeoutMs: 20 }, deps(resolve, transport)),
    ).rejects.toMatchObject({ reason: "dns_failed" });
  });
});

describe("safeOutboundRequest: DNS rebinding", () => {
  it("connects only to the validated address even if DNS later answers differently", async () => {
    const transport = makeTransport([{ status: 200 }]);
    // First resolution is public. Any later resolution would be loopback (the rebinding answer).
    const resolve = vi
      .fn<OutboundDeps["resolve"]>()
      .mockResolvedValueOnce([v4(PUBLIC_V4)])
      .mockResolvedValue([v4("127.0.0.1")]);

    const res = await safeOutboundRequest("https://hooks.example.com/h", { method: "POST", body: "{}" }, {}, deps(resolve, transport));

    expect(res.status).toBe(200);
    expect(resolve).toHaveBeenCalledTimes(1); // no second resolution between validation and connection
    expect(transport.connectedTo).toEqual([PUBLIC_V4]); // socket lookup returns the pinned IP, not a fresh answer
  });

  it("pins every address family it validated", async () => {
    const transport = makeTransport([{ status: 200 }]);
    const resolve = async () => [v6("2606:4700:4700::1111"), v4(PUBLIC_V4)];
    await safeOutboundRequest("https://hooks.example.com/h", {}, {}, deps(resolve, transport));
    expect(transport.connectedTo).toEqual(["2606:4700:4700::1111"]);
  });

  it("re-resolves and re-validates per call, so a record that turns private is caught on the next attempt", async () => {
    const transport = makeTransport([{ status: 200 }]);
    const resolve = vi
      .fn<OutboundDeps["resolve"]>()
      .mockResolvedValueOnce([v4(PUBLIC_V4)])
      .mockResolvedValueOnce([v4("10.0.0.7")]);
    const d = deps(resolve, transport);
    await expect(safeOutboundRequest("https://hooks.example.com/h", {}, {}, d)).resolves.toMatchObject({ status: 200 });
    await expect(safeOutboundRequest("https://hooks.example.com/h", {}, {}, d)).rejects.toMatchObject({ reason: "ip_blocked" });
    expect(transport.spy).toHaveBeenCalledTimes(1);
  });
});

describe("safeOutboundRequest: redirects", () => {
  it("does not follow redirects by default and surfaces the 3xx", async () => {
    const transport = makeTransport([{ status: 302, headers: { location: "https://169.254.169.254/latest/meta-data" } }]);
    const resolve = vi.fn(async () => [v4(PUBLIC_V4)]);
    const res = await safeOutboundRequest("https://hooks.example.com/h", {}, {}, deps(resolve, transport));
    expect(res.status).toBe(302);
    expect(transport.spy).toHaveBeenCalledTimes(1);
  });

  it("when redirects are enabled, a hop to a prohibited address is blocked before connecting", async () => {
    const transport = makeTransport([{ status: 302, headers: { location: "https://169.254.169.254/latest/meta-data" } }]);
    const resolve = vi.fn(async () => [v4(PUBLIC_V4)]);
    await expect(
      safeOutboundRequest("https://hooks.example.com/h", {}, { maxRedirects: 3 }, deps(resolve, transport)),
    ).rejects.toMatchObject({ reason: "ip_blocked" });
    expect(transport.spy).toHaveBeenCalledTimes(1); // second hop never connected
  });

  it("re-runs DNS validation on a redirect to a hostname resolving privately", async () => {
    const transport = makeTransport([{ status: 301, headers: { location: "https://inner.example.net/x" } }]);
    const resolve = vi.fn(async (host: string) => [v4(host === "inner.example.net" ? "192.168.1.10" : PUBLIC_V4)]);
    await expect(
      safeOutboundRequest("https://hooks.example.com/h", {}, { maxRedirects: 3 }, deps(resolve, transport)),
    ).rejects.toMatchObject({ reason: "ip_blocked" });
    expect(transport.spy).toHaveBeenCalledTimes(1);
  });

  it("rejects redirect downgrade to http", async () => {
    const transport = makeTransport([{ status: 302, headers: { location: "http://hooks.example.com/plain" } }]);
    const resolve = vi.fn(async () => [v4(PUBLIC_V4)]);
    await expect(
      safeOutboundRequest("https://hooks.example.com/h", {}, { maxRedirects: 3 }, deps(resolve, transport)),
    ).rejects.toMatchObject({ reason: "scheme_not_allowed" });
  });

  it("caps the number of hops", async () => {
    const transport = makeTransport([{ status: 302, headers: { location: "https://hooks.example.com/again" } }]);
    const resolve = vi.fn(async () => [v4(PUBLIC_V4)]);
    await expect(
      safeOutboundRequest("https://hooks.example.com/h", {}, { maxRedirects: 2 }, deps(resolve, transport)),
    ).rejects.toMatchObject({ reason: "too_many_redirects" });
    expect(transport.spy).toHaveBeenCalledTimes(3);
  });

  it("follows a legitimate public redirect", async () => {
    const transport = makeTransport([
      { status: 302, headers: { location: "https://hooks2.example.com/final" } },
      { status: 200, body: "ok" },
    ]);
    const resolve = vi.fn(async () => [v4(PUBLIC_V4)]);
    const res = await safeOutboundRequest("https://hooks.example.com/h", {}, { maxRedirects: 2 }, deps(resolve, transport));
    expect(res.status).toBe(200);
    expect(transport.requests.map((r) => r.hostname)).toEqual(["hooks.example.com", "hooks2.example.com"]);
  });
});

describe("safeOutboundRequest: legitimate delivery and limits", () => {
  it("delivers to a public, allowlisted destination", async () => {
    const transport = makeTransport([{ status: 204 }]);
    const resolve = vi.fn(async () => [v4(PUBLIC_V4)]);
    const res = await safeOutboundRequest(
      "https://hooks.example.com/sponsor?id=1",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"a":1}' },
      { allowedHosts: ["hooks.example.com"] },
      deps(resolve, transport),
    );
    expect(res.status).toBe(204);
    expect(transport.requests[0]).toEqual({ hostname: "hooks.example.com", path: "/sponsor?id=1", method: "POST" });
    expect(transport.connectedTo).toEqual([PUBLIC_V4]);
  });

  it("refuses a public host that is not on the allowlist, before resolving DNS", async () => {
    const transport = makeTransport([{ status: 200 }]);
    const resolve = vi.fn(async () => [v4(PUBLIC_V4)]);
    await expect(
      safeOutboundRequest("https://other.example.com/h", {}, { allowedHosts: ["hooks.example.com"] }, deps(resolve, transport)),
    ).rejects.toMatchObject({ reason: "host_not_allowlisted" });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("caps the response body", async () => {
    const transport = makeTransport([{ status: 200, body: "x".repeat(10_000) }]);
    const resolve = vi.fn(async () => [v4(PUBLIC_V4)]);
    const res = await safeOutboundRequest("https://hooks.example.com/h", {}, { maxResponseBytes: 100 }, deps(resolve, transport));
    expect(res.truncated).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(100);
  });
});

describe("isSafeOutboundUrl", () => {
  it("returns booleans for policy outcomes", async () => {
    const resolve = async (host: string) => [v4(host === "evil.example.com" ? "10.0.0.1" : PUBLIC_V4)];
    const transport = makeTransport([{ status: 200 }]);
    const d = deps(resolve, transport);
    await expect(isSafeOutboundUrl("https://hooks.example.com/x", {}, d)).resolves.toBe(true);
    await expect(isSafeOutboundUrl("https://evil.example.com/x", {}, d)).resolves.toBe(false);
    await expect(isSafeOutboundUrl("http://hooks.example.com/x", {}, d)).resolves.toBe(false);
  });
});
