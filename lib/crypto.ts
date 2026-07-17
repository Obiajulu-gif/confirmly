import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { requireEnv } from "@/lib/env";

/**
 * AES-256-GCM encryption for sensitive-at-rest values (settlement bank
 * account numbers). Ciphertext format: base64(iv | authTag | data).
 */

function key(): Buffer {
  const { ENCRYPTION_KEY } = requireEnv("ENCRYPTION_KEY");
  // Accept any high-entropy string — derive exactly 32 bytes.
  return createHash("sha256").update(ENCRYPTION_KEY).digest();
}

export function encryptString(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function decryptString(ciphertext: string): string {
  const raw = Buffer.from(ciphertext, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  );
}

/** 0123456789 → ******6789 (display-safe). */
export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}
