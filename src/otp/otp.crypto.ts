import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000)
    .toString()
    .padStart(6, "0");
}

export function hashOtpCode(
  code: string,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(code)
    .digest("hex");
}

export function encryptOtpCode(
  code: string,
  encryptionKeyHex: string,
): string {
  const key = Buffer.from(encryptionKeyHex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    key,
    iv,
  );
  const encrypted = Buffer.concat([
    cipher.update(code, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("hex"),
    authTag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

export function decryptOtpCode(
  payload: string,
  encryptionKeyHex: string,
): string {
  const [ivHex, authTagHex, encryptedHex] =
    payload.split(":");

  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Invalid OTP encrypted payload");
  }

  const key = Buffer.from(encryptionKeyHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    iv,
  );

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

export function compareOtpCode(
  code: string,
  storedHash: string,
  secret: string,
): boolean {
  const calculatedHash = hashOtpCode(code, secret);

  const calculatedBuffer = Buffer.from(
    calculatedHash,
    "hex",
  );

  const storedBuffer = Buffer.from(storedHash, "hex");

  if (calculatedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(
    calculatedBuffer,
    storedBuffer,
  );
}
