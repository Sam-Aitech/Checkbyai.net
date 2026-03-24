import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const keyHex = process.env.PHONE_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error("[PhoneCrypto] PHONE_ENCRYPTION_KEY not set — refusing to store phone numbers in plain text. Set a 64-hex-char key.");
  }
  const keyBuffer = Buffer.from(keyHex, "hex");
  if (keyBuffer.length !== 32) {
    throw new Error(`[PhoneCrypto] PHONE_ENCRYPTION_KEY must be 64 hex chars (32 bytes). Got ${keyBuffer.length} bytes.`);
  }
  return keyBuffer;
}

const ENC_PREFIX = "enc:";

export function encryptPhone(phone: string): string {
  if (!phone) return phone;
  const key = getKey();

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(phone, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptPhone(encryptedPhone: string): string {
  if (!encryptedPhone) return encryptedPhone;
  const key = getKey();
  if (key.length === 0) return encryptedPhone;

  if (!encryptedPhone.startsWith(ENC_PREFIX)) return encryptedPhone;

  try {
    const payload = encryptedPhone.slice(ENC_PREFIX.length);
    const data = Buffer.from(payload, "base64");
    if (data.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      console.error("[PhoneCrypto] Encrypted payload too short");
      return encryptedPhone;
    }

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err: unknown) {
    console.error("[PhoneCrypto] Decryption failed:", err instanceof Error ? err.message : err);
    return encryptedPhone;
  }
}
