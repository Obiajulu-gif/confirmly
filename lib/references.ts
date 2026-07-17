import { randomBytes } from "crypto";

/** Unambiguous alphabet (no 0/O/1/I/L). */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[(bytes[i] as number) % ALPHABET.length];
  }
  return out;
}

/** Public order reference, e.g. CFY-8K2MHQ4T. */
export function generateOrderReference(): string {
  return `CFY-${randomCode(8)}`;
}

/**
 * Payment invoice reference. Every payment attempt gets a NEW unique
 * reference — expired/failed invoices are never reused.
 */
export function generateInvoiceReference(
  orderReference: string,
  attempt: number
): string {
  return `${orderReference}-P${attempt}-${randomCode(6)}`;
}

/** High-entropy receipt token (256 bits, URL-safe). */
export function generateReceiptToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Idempotency key for a provider webhook event. */
export function webhookEventKey(provider: string, parts: (string | number | null | undefined)[]): string {
  return `${provider}:${parts.filter((p) => p !== null && p !== undefined).join(":")}`;
}
