import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptPhone, decryptPhone } from "../phoneCrypto";

// 64 hex chars = 32 bytes, valid AES-256 key
const VALID_KEY = "a".repeat(64);

describe("phoneCrypto", () => {
  const originalKey = process.env.PHONE_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.PHONE_ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.PHONE_ENCRYPTION_KEY;
    } else {
      process.env.PHONE_ENCRYPTION_KEY = originalKey;
    }
  });

  // ── encryptPhone ────────────────────────────────────────────────────────────

  describe("encryptPhone", () => {
    it("returns empty string unchanged", () => {
      expect(encryptPhone("")).toBe("");
    });

    it("prefixes encrypted output with 'enc:'", () => {
      expect(encryptPhone("+447700000000")).toMatch(/^enc:/);
    });

    it("produces unique ciphertexts for same input (random IV)", () => {
      const a = encryptPhone("+447700000000");
      const b = encryptPhone("+447700000000");
      expect(a).not.toBe(b);
    });

    it("throws when PHONE_ENCRYPTION_KEY is not set", () => {
      delete process.env.PHONE_ENCRYPTION_KEY;
      expect(() => encryptPhone("+447700000000")).toThrow("PHONE_ENCRYPTION_KEY not set");
    });

    it("throws when PHONE_ENCRYPTION_KEY is too short (not 64 hex chars)", () => {
      process.env.PHONE_ENCRYPTION_KEY = "deadbeef"; // only 4 bytes
      expect(() => encryptPhone("+447700000000")).toThrow("must be 64 hex chars");
    });
  });

  // ── decryptPhone ────────────────────────────────────────────────────────────

  describe("decryptPhone", () => {
    it("returns empty string unchanged", () => {
      expect(decryptPhone("")).toBe("");
    });

    it("roundtrips: decrypt(encrypt(x)) === x", () => {
      const phone = "+447700123456";
      expect(decryptPhone(encryptPhone(phone))).toBe(phone);
    });

    it("roundtrips with special characters", () => {
      const phone = "+1 (555) 000-0000";
      expect(decryptPhone(encryptPhone(phone))).toBe(phone);
    });

    it("passes through plaintext (no enc: prefix) unchanged", () => {
      expect(decryptPhone("+447700000000")).toBe("+447700000000");
    });

    it("returns the corrupt ciphertext rather than throwing on truncated payload", () => {
      // "enc:" + base64 that decodes to fewer than IV_LENGTH+AUTH_TAG_LENGTH+1 bytes
      const tooShort = "enc:" + Buffer.from("short").toString("base64");
      const result = decryptPhone(tooShort);
      expect(result).toBe(tooShort);
    });

    it("returns the corrupt ciphertext rather than throwing on tampered payload", () => {
      const encrypted = encryptPhone("+447700000000");
      // Flip the last character to corrupt the auth tag
      const tampered = encrypted.slice(0, -1) + (encrypted.endsWith("A") ? "B" : "A");
      const result = decryptPhone(tampered);
      expect(result).toBe(tampered);
    });
  });
});
