import {
  createHmac,
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