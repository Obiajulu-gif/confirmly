import { createHmac, timingSafeEqual } from "crypto";

/**
 * Validates the `monnify-signature` header: HMAC-SHA512 of the RAW request
 * body computed with the Monnify secret key, hex-encoded.
 */
export function verifyMonnifySignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secretKey: string
): boolean {
  if (!signatureHeader || !secretKey) return false;
  const computed = createHmac("sha512", secretKey)
    .update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody)
    .digest("hex");
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(signatureHeader.trim().toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Computes the signature — used by tests and the local simulator. */
export function computeMonnifySignature(
  rawBody: string | Buffer,
  secretKey: string
): string {
  return createHmac("sha512", secretKey)
    .update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody)
    .digest("hex");
}
