import "server-only";
import { env } from "@/lib/env";

/**
 * Customer onboarding now happens conversationally inside WhatsApp (see
 * lib/orders/engine.ts): after a customer selects a store, the assistant
 * collects their name and default delivery area in chat. This module keeps
 * the deep-link and phone helpers used across the app.
 */

/**
 * Normalizes a phone number to WhatsApp id digits.
 * Nigerian convention: a leading 0 on an 11-digit number becomes 234….
 * Returns null when the input can't be a real number.
 */
export function normalizeWhatsAppNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  if (digits.length === 11 && digits.startsWith("0")) {
    return `234${digits.slice(1)}`;
  }
  if (digits.length === 10 && !digits.startsWith("0")) {
    return `234${digits}`;
  }
  return digits;
}

/**
 * wa.me deep link that opens the shared business number with the store
 * selection command prefilled — deterministic routing into the right shop.
 * Pass a resolved display number (see resolveWhatsAppPublicNumber) to avoid
 * relying solely on the WHATSAPP_PUBLIC_NUMBER env value.
 */
export function buildWaLink(
  storeCode: string,
  resolvedPublicNumber?: string | null
): string | null {
  const digits = (
    resolvedPublicNumber ??
    env().WHATSAPP_PUBLIC_NUMBER ??
    ""
  ).replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(`START ${storeCode}`)}`;
}
