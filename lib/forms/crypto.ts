import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey() {
  const value = process.env.FORM_ENCRYPTION_KEY;
  if (!value) throw new Error("FORM_ENCRYPTION_KEY must be configured before forms can persist data.");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("FORM_ENCRYPTION_KEY must be a 32-byte base64 value.");
  return key;
}

export function encryptValue(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, body].map((part) => part.toString("base64url")).join(".");
}

export function decryptValue<T>(encrypted: string): T {
  const [ivEncoded, tagEncoded, bodyEncoded] = encrypted.split(".");
  if (!ivEncoded || !tagEncoded || !bodyEncoded) throw new Error("Invalid encrypted form value.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(bodyEncoded, "base64url")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
