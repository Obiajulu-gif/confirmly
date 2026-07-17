"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createSessionToken,
  getMerchantSession,
  getSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  createBusinessForUser,
  MerchantServiceError,
  saveSettlementAccount,
  seedStarterCatalogue,
  validateSettlementAccount,
} from "@/lib/merchants/service";

export interface WizardState {
  error: string | null;
  /** Resolved account name awaiting explicit confirmation (step 2). */
  resolvedAccountName: string | null;
  /** Provider notice, e.g. validation unavailable in sandbox. */
  notice: string | null;
}

const EMPTY: WizardState = { error: null, resolvedAccountName: null, notice: null };

// --- Step 1: business ---------------------------------------------------------

const businessSchema = z.object({
  name: z.string().min(2).max(100),
  category: z.string().max(60).optional().or(z.literal("")),
  description: z.string().max(500).optional().or(z.literal("")),
  supportEmail: z.string().email().optional().or(z.literal("")),
  phoneNumber: z.string().max(20).optional().or(z.literal("")),
  address: z.string().max(200).optional().or(z.literal("")),
  stateRegion: z.string().max(60).optional().or(z.literal("")),
  country: z.string().max(60).optional().or(z.literal("")),
});

export async function createBusinessAction(
  _prev: WizardState,
  formData: FormData
): Promise<WizardState> {
  const session = await getSession();
  if (!session) redirect("/login?next=/onboarding");
  if (session.merchantId) redirect("/onboarding"); // already registered

  const parsed = businessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ...EMPTY, error: parsed.error.issues[0]?.message ?? "Check the form" };
  }
  try {
    const merchant = await createBusinessForUser(session.userId, {
      name: parsed.data.name,
      category: parsed.data.category || undefined,
      description: parsed.data.description || undefined,
      supportEmail: parsed.data.supportEmail || undefined,
      phoneNumber: parsed.data.phoneNumber || undefined,
      address: parsed.data.address || undefined,
      stateRegion: parsed.data.stateRegion || undefined,
      country: parsed.data.country || undefined,
    });
    // The merchant id lives in the signed session — re-issue it.
    const token = await createSessionToken({
      userId: session.userId,
      email: session.email,
      merchantId: merchant.id,
    });
    const store = await cookies();
    store.set(SESSION_COOKIE, token, sessionCookieOptions());
  } catch (err) {
    return {
      ...EMPTY,
      error:
        err instanceof MerchantServiceError
          ? err.message
          : "Could not register the business. Please try again.",
    };
  }
  redirect("/onboarding");
}

// --- Step 2: settlement account ----------------------------------------------

const accountSchema = z.object({
  bank: z.string().regex(/^\d{3,6}\|.+$/, "Choose your bank"),
  accountNumber: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().regex(/^\d{10}$/, "Account number must be 10 digits")),
});

export async function validateAccountAction(
  _prev: WizardState,
  formData: FormData
): Promise<WizardState> {
  const session = await getMerchantSession();
  if (!session) redirect("/login?next=/onboarding");

  const parsed = accountSchema.safeParse({
    bank: formData.get("bank"),
    accountNumber: formData.get("accountNumber"),
  });
  if (!parsed.success) {
    return { ...EMPTY, error: parsed.error.issues[0]?.message ?? "Check the form" };
  }
  const [bankCode] = parsed.data.bank.split("|");

  const result = await validateSettlementAccount(
    parsed.data.accountNumber,
    bankCode ?? ""
  );
  if (result.status === "VALIDATED") {
    return { error: null, resolvedAccountName: result.accountName ?? null, notice: null };
  }
  if (result.status === "INVALID_ACCOUNT") {
    return { ...EMPTY, error: result.message ?? "Account could not be resolved." };
  }
  // Validation feature unavailable: allow saving with a clear notice — the
  // profile stays PENDING_VALIDATION and checkout routing reflects it.
  return {
    error: null,
    resolvedAccountName: null,
    notice:
      result.message ??
      "Monnify account validation is unavailable right now. You can save the account — it will be validated before settlement routing activates.",
  };
}

export async function confirmAccountAction(
  _prev: WizardState,
  formData: FormData
): Promise<WizardState> {
  const session = await getMerchantSession();
  if (!session) redirect("/login?next=/onboarding");

  const parsed = accountSchema.safeParse({
    bank: formData.get("bank"),
    accountNumber: formData.get("accountNumber"),
  });
  if (!parsed.success) {
    return { ...EMPTY, error: "The account details were lost — enter them again." };
  }
  const [bankCode, ...nameParts] = parsed.data.bank.split("|");
  const resolvedAccountName =
    typeof formData.get("resolvedAccountName") === "string" &&
    (formData.get("resolvedAccountName") as string).length > 1
      ? (formData.get("resolvedAccountName") as string)
      : null;

  try {
    await saveSettlementAccount({
      merchantId: session.merchantId,
      bankCode: bankCode ?? "",
      bankName: nameParts.join("|"),
      accountNumber: parsed.data.accountNumber,
      resolvedAccountName,
      actorEmail: session.email,
    });
  } catch (err) {
    return {
      ...EMPTY,
      error:
        err instanceof MerchantServiceError
          ? err.message
          : "Could not save the settlement account. Please try again.",
    };
  }
  redirect("/onboarding");
}

// --- Step 3: starter catalogue --------------------------------------------------

export async function starterCatalogueAction(): Promise<void> {
  const session = await getMerchantSession();
  if (!session) redirect("/login?next=/onboarding");
  await seedStarterCatalogue(session.merchantId);
  redirect("/onboarding");
}

// --- Step 4: finish --------------------------------------------------------------

export async function finishOnboardingAction(): Promise<void> {
  const session = await getMerchantSession();
  if (!session) redirect("/login?next=/onboarding");
  await prisma.merchant.update({
    where: { id: session.merchantId },
    data: { onboardedAt: new Date() },
  });
  redirect("/dashboard");
}
