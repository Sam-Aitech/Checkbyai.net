import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const keyHex = process.env.PHONE_ENCRYPTION_KEY;
  if (!keyHex) {
    console.warn("[PhoneCrypto] PHONE_ENCRYPTION_KEY not set, phone numbers will be stored in plain text");
    return Buffer.alloc(0);
  }
  const keyBuffer = Buffer.from(keyHex, "hex");
  if (keyBuffer.length !== 32) {
    console.warn("[PhoneCrypto] PHONE_ENCRYPTION_KEY must be 64 hex chars (32 bytes). Got length:", keyBuffer.length);
    return Buffer.alloc(0);
  }
  return keyBuffer;
}

const ENC_PREFIX = "enc:";

export function encryptPhone(phone: string): string {
  if (!phone) return phone;
  const key = getKey();
  if (key.length === 0) return phone;

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(phone, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return ENC_PREFIX + Buffer.concat([iv, authTag, encrypted]).toString("base64");
  } catch (err: any) {
    console.error("[PhoneCrypto] Encryption failed:", err.message);
    return phone;
  }
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
  } catch (err: any) {
    console.error("[PhoneCrypto] Decryption failed:", err.message);
    return encryptedPhone;
  }
}
