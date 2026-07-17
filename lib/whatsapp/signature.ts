import { createHmac, timingSafeEqual } from "crypto";

/**
 * Validates Meta's X-Hub-Signature-256 header: HMAC-SHA256 of the RAW request
 * body using the app secret, hex-encoded and prefixed with "sha256=".
 * Comparison is constant-time.
 */
export function verifyMetaSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const expected = signatureHeader.trim();
  if (!expected.startsWith("sha256=")) return false;

  const digest = createHmac("sha256", appSecret)
    .update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody)
    .digest("hex");
  const computed = `sha256=${digest}`;

  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
