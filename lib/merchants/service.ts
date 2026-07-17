import "server-only";
import { prisma } from "@/lib/db";
import { encryptString, maskAccountNumber } from "@/lib/crypto";
import { recordAudit } from "@/lib/orders/audit";
import { validateBankAccount } from "@/lib/monnify/account-validation";
import { ensureSubaccount } from "@/lib/monnify/subaccounts";

/** Business registration + settlement-account lifecycle. */

export class MerchantServiceError extends Error {}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 40);
}

export function deriveStoreCode(slug: string): string {
  return slug.replace(/-/g, "").toUpperCase().slice(0, 16);
}

export interface CreateBusinessInput {
  name: string;
  slug?: string;
  category?: string;
  description?: string;
  supportEmail?: string;
  phoneNumber?: string;
  address?: string;
  stateRegion?: string;
  country?: string;
}

export async function createBusinessForUser(
  userId: string,
  input: CreateBusinessInput
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const baseSlug = slugify(input.slug?.trim() || input.name);
  if (baseSlug.length < 3) {
    throw new MerchantServiceError(
      "Business name is too short to build a store link from."
    );
  }

  // Find a free slug/storeCode pair (slug-2, slug-3, … on collision).
  let slug = baseSlug;
  let storeCode = deriveStoreCode(baseSlug);
  for (let i = 2; i <= 20; i++) {
    const clash = await prisma.merchant.findFirst({
      where: { OR: [{ slug }, { storeCode }] },
      select: { id: true },
    });
    if (!clash) break;
    slug = `${baseSlug}-${i}`;
    storeCode = deriveStoreCode(slug);
  }

  const merchant = await prisma.merchant.create({
    data: {
      name: input.name.trim().slice(0, 100),
      slug,
      storeCode,
      email: user.email,
      category: input.category?.trim() || null,
      description: input.description?.trim().slice(0, 500) || null,
      supportEmail: input.supportEmail?.trim() || user.email,
      phoneNumber: input.phoneNumber?.trim() || null,
      address: input.address?.trim() || null,
      stateRegion: input.stateRegion?.trim() || null,
      country: input.country?.trim() || "Nigeria",
      currency: "NGN",
    },
  });
  await prisma.merchantMembership.create({
    data: { userId, merchantId: merchant.id, role: "OWNER" },
  });
  await recordAudit({
    merchantId: merchant.id,
    event: "Business registered",
    actor: "MERCHANT",
    metadata: { slug, storeCode },
  });
  return merchant;
}

// --- Settlement account -----------------------------------------------------

export interface SettlementValidation {
  status: "VALIDATED" | "INVALID_ACCOUNT" | "FEATURE_UNAVAILABLE" | "PROVIDER_ERROR";
  accountName?: string;
  message?: string;
}

/** Step A: resolve the account name with Monnify (nothing stored yet). */
export async function validateSettlementAccount(
  accountNumber: string,
  bankCode: string
): Promise<SettlementValidation> {
  const result = await validateBankAccount(accountNumber, bankCode);
  if (result.status === "VALIDATED") {
    return { status: "VALIDATED", accountName: result.accountName };
  }
  return { status: result.status, message: result.message };
}

export interface SaveSettlementResult {
  profileId: string;
  accountName: string | null;
  subaccountStatus: "ACTIVE" | "ACTIVATION_REQUIRED" | "FAILED";
  active: boolean;
  message?: string;
}

/**
 * Step B: after the merchant explicitly confirms the RESOLVED name, store the
 * profile (account number encrypted, masked for display) and create the
 * Monnify subaccount idempotently. Any previous profile is preserved as
 * history and marked REPLACED.
 */
export async function saveSettlementAccount(input: {
  merchantId: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  resolvedAccountName: string | null;
  actorEmail: string;
}): Promise<SaveSettlementResult> {
  const digits = input.accountNumber.replace(/\D/g, "");
  if (!/^\d{10}$/.test(digits)) {
    throw new MerchantServiceError("Account number must be 10 digits.");
  }
  const merchant = await prisma.merchant.findUniqueOrThrow({
    where: { id: input.merchantId },
  });

  // Preserve history: retire any previous profile.
  await prisma.merchantPaymentProfile.updateMany({
    where: { merchantId: merchant.id, active: true },
    data: { active: false, subaccountStatus: "REPLACED" },
  });

  const sub = await ensureSubaccount({
    bankCode: input.bankCode,
    accountNumber: digits,
    email: merchant.supportEmail ?? merchant.email,
    splitPercentage: 100,
  });

  const profile = await prisma.merchantPaymentProfile.create({
    data: {
      merchantId: merchant.id,
      bankCode: input.bankCode,
      bankName: input.bankName.slice(0, 100),
      accountNumberEnc: encryptString(digits),
      accountNumberMasked: maskAccountNumber(digits),
      accountName: input.resolvedAccountName,
      validationStatus: input.resolvedAccountName
        ? "VALIDATED"
        : "PENDING_VALIDATION",
      lastValidatedAt: input.resolvedAccountName ? new Date() : null,
      subAccountCode: sub.status === "ACTIVE" ? sub.subAccountCode : null,
      subaccountStatus: sub.status,
      splitPercentage: 100,
      // Active (checkout-ready) only after a successful subaccount creation.
      active: sub.status === "ACTIVE",
    },
  });

  await recordAudit({
    merchantId: merchant.id,
    event: "Settlement account saved",
    actor: "MERCHANT",
    metadata: {
      by: input.actorEmail,
      bank: input.bankName,
      masked: profile.accountNumberMasked,
      subaccountStatus: sub.status,
    },
  });

  return {
    profileId: profile.id,
    accountName: profile.accountName,
    subaccountStatus: sub.status,
    active: profile.active,
    message: sub.status === "ACTIVE" ? undefined : sub.message,
  };
}

/** Seeds a starter catalogue + Lagos delivery zones for a new merchant. */
export async function seedStarterCatalogue(merchantId: string) {
  const productCount = await prisma.product.count({ where: { merchantId } });
  if (productCount === 0) {
    await prisma.product.createMany({
      data: [
        {
          merchantId,
          name: "Sample Product",
          description: "Replace this with your first real product.",
          category: "General",
          priceKobo: 500_000,
          aliases: ["sample"],
          stockQuantity: 25,
          active: true,
        },
      ],
    });
  }
  const zoneCount = await prisma.deliveryZone.count({ where: { merchantId } });
  if (zoneCount === 0) {
    await prisma.deliveryZone.createMany({
      data: [
        { merchantId, name: "Yaba", aliases: ["yaba", "akoka"], feeKobo: 250_000 },
        { merchantId, name: "Surulere", aliases: ["surulere"], feeKobo: 300_000 },
        { merchantId, name: "Ikeja", aliases: ["ikeja"], feeKobo: 350_000 },
        { merchantId, name: "Lekki", aliases: ["lekki", "ajah"], feeKobo: 500_000 },
        { merchantId, name: "Pickup", aliases: ["pickup", "pick up"], feeKobo: 0 },
      ],
    });
  }
}
