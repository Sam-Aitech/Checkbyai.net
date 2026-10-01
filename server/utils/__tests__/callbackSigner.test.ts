import { describe, expect, it } from "vitest";
import { isSafeCallbackUrl, signPayload, signPayloadWithTimestamp, verifySignature } from "../callbackSigner";

describe("callbackSigner", () => {
  it("signs and verifies a payload", () => {
    const payload = JSON.stringify({ hello: "world" });
    const secret = "top-secret";
    const signature = signPayload(payload, secret);

    expect(signature.startsWith("sha256=")).toBe(true);
    expect(verifySignature(payload, signature, secret)).toBe(true);
  });

  it("rejects tampered payloads", () => {
    const payload = JSON.stringify({ job: "ok" });
    const signature = signPayload(payload, "secret-1");
    expect(verifySignature(`${payload}!`, signature, "secret-1")).toBe(false);
  });

  it("rejects unsafe callback URLs", async () => {
    await expect(isSafeCallbackUrl("http://example.com/webhook")).resolves.toBe(false);
    await expect(isSafeCallbackUrl("https://localhost/webhook")).resolves.toBe(false);
    await expect(isSafeCallbackUrl("https://127.0.0.1/webhook")).resolves.toBe(false);
    await expect(isSafeCallbackUrl("https://10.1.2.3/webhook")).resolves.toBe(false);
    await expect(isSafeCallbackUrl("https://169.254.169.254/latest/meta-data")).resolves.toBe(false);
    await expect(isSafeCallbackUrl("https://[::1]/webhook")).resolves.toBe(false);
    await expect(isSafeCallbackUrl("https://service.local/webhook")).resolves.toBe(false);
    await expect(isSafeCallbackUrl("https://[::ffff:127.0.0.1]/webhook")).resolves.toBe(false);
    await expect(isSafeCallbackUrl("https://[::ffff:a9fe:a9fe]/webhook")).resolves.toBe(false);
    await expect(isSafeCallbackUrl("https://[fd00:ec2::254]/webhook")).resolves.toBe(false);
    await expect(isSafeCallbackUrl("https://100.64.0.1/webhook")).resolves.toBe(false);
    await expect(isSafeCallbackUrl("https://0.0.0.0/webhook")).resolves.toBe(false);
    await expect(isSafeCallbackUrl("https://user:pw@8.8.8.8/webhook")).resolves.toBe(false);
    await expect(isSafeCallbackUrl("https://8.8.8.8:8443/webhook")).resolves.toBe(false);
  });

  it("binds the timestamp into the V2 signature", () => {
    const body = JSON.stringify({ a: 1 });
    const sig = signPayloadWithTimestamp(body, "s", 1_700_000_000);
    expect(sig).toBe(signPayloadWithTimestamp(body, "s", 1_700_000_000));
    expect(sig).not.toBe(signPayloadWithTimestamp(body, "s", 1_700_000_001));
    expect(sig).not.toBe(signPayload(body, "s"));
  });

  it("accepts normal https callback URLs", async () => {
    await expect(isSafeCallbackUrl("https://8.8.8.8/checkbyai")).resolves.toBe(true);
  });
});
