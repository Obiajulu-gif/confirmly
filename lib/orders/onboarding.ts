import "server-only";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { recordAudit } from "@/lib/orders/audit";

/**
 * Customer onboarding: captures the details needed for a smooth first order
 * (name, WhatsApp number, delivery area/address) BEFORE the chat starts, so
 * the conversation engine can skip questions it already knows the answer to.
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
    // Local number without the leading zero (e.g. 803…): assume Nigeria.
    return `234${digits}`;
  }
  return digits;
}

export interface OnboardingInput {
  name: string;
  phone: string;
  area?: string | null;
  address?: string | null;
  /** Store the customer is onboarding for (multi-merchant). */
  storeCode?: string | null;
}

export interface OnboardingResult {
  waId: string;
  merchantName: string;
  /** wa.me deep link with a friendly prefilled message, when a business
   *  number is configured. */
  waLink: string | null;
  knownZone: string | null;
}

export class OnboardingError extends Error {}

export async function saveCustomerProfile(
  input: OnboardingInput
): Promise<OnboardingResult> {
  const waId = normalizeWhatsAppNumber(input.phone);
  if (!waId) {
    throw new OnboardingError(
      "That doesn't look like a valid WhatsApp number. Use e.g. 0803 123 4567 or +234 803 123 4567."
    );
  }
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) {
    throw new OnboardingError("Please tell us your name.");
  }

  const merchant = input.storeCode
    ? await prisma.merchant.findFirst({
        where: {
          storeCode: input.storeCode.replace(/-/g, "").toUpperCase(),
          active: true,
        },
      })
    : await prisma.merchant.findFirst({
        where: { active: true },
        orderBy: { createdAt: "asc" },
      });
  if (!merchant) {
    throw new OnboardingError("That store could not be found. Please try later.");
  }

  // Pre-select this store for their WhatsApp session so the first message
  // lands directly in the right shop.
  await prisma.waSession.upsert({
    where: { waId },
    update: { activeMerchantId: merchant.id },
    create: { waId, activeMerchantId: merchant.id, profileName: name },
  });

  // Validate the chosen area against real delivery zones (DB decides).
  let knownZone: string | null = null;
  if (input.area) {
    const zone = await prisma.deliveryZone.findFirst({
      where: {
        merchantId: merchant.id,
        active: true,
        name: { equals: input.area, mode: "insensitive" },
      },
    });
    knownZone = zone?.name ?? null;
  }

  const defaultAddress =
    [input.address?.trim(), knownZone].filter(Boolean).join(", ") || null;

  const customer = await prisma.customer.upsert({
    where: { merchantId_waId: { merchantId: merchant.id, waId } },
    update: {
      name, // explicit onboarding beats WhatsApp profile names
      phoneNumber: waId,
      ...(defaultAddress ? { defaultAddress } : {}),
    },
    create: {
      merchantId: merchant.id,
      waId,
      phoneNumber: waId,
      name,
      defaultAddress,
    },
  });

  await recordAudit({
    merchantId: merchant.id,
    event: "Customer onboarded",
    actor: "CUSTOMER",
    metadata: {
      customerId: customer.id,
      hasDefaultAddress: Boolean(defaultAddress),
    },
  });

  return {
    waId,
    merchantName: merchant.name,
    waLink: buildWaLink(merchant.storeCode),
    knownZone,
  };
}

/**
 * wa.me deep link that opens the shared business number with the store
 * selection command prefilled — deterministic routing into the right shop.
 */
export function buildWaLink(storeCode: string): string | null {
  const digits = (env().WHATSAPP_PUBLIC_NUMBER ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(`START ${storeCode}`)}`;
}
