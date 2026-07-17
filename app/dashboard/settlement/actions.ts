"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getMerchantSession, reauthenticate } from "@/lib/auth";
import {
  MerchantServiceError,
  saveSettlementAccount,
  validateSettlementAccount,
} from "@/lib/merchants/service";
import { rateLimit } from "@/lib/rate-limit";

export interface ReplaceState {
  error: string | null;
  resolvedAccountName: string | null;
  notice: string | null;
  done: boolean;
}

const EMPTY: ReplaceState = {
  error: null,
  resolvedAccountName: null,
  notice: null,
  done: false,
};

const schema = z.object({
  bank: z.string().regex(/^\d{3,6}\|.+$/, "Choose your bank"),
  accountNumber: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().regex(/^\d{10}$/, "Account number must be 10 digits")),
  password: z.string().min(1, "Enter your password to authorise this change"),
});

/**
 * Replacing a settlement account requires reauthentication, re-runs Monnify
 * validation, recreates the subaccount, preserves the old profile as
 * history, and records an audit event (inside the service).
 */
export async function replaceAccountAction(
  _prev: ReplaceState,
  formData: FormData
): Promise<ReplaceState> {
  const session = await getMerchantSession();
  if (!session) return { ...EMPTY, error: "Session expired — log in again." };

  const parsed = schema.safeParse({
    bank: formData.get("bank"),
    accountNumber: formData.get("accountNumber"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ...EMPTY, error: parsed.error.issues[0]?.message ?? "Check the form" };
  }

  const limited = rateLimit(`replace-account:${session.userId}`, {
    limit: 5,
    windowMs: 10 * 60_000,
  });
  if (!limited.ok) {
    return { ...EMPTY, error: `Too many attempts. Try again in ${limited.retryAfterSeconds}s.` };
  }

  // Reauthentication gate for a sensitive change.
  const passwordOk = await reauthenticate(session.userId, parsed.data.password);
  if (!passwordOk) {
    return { ...EMPTY, error: "Password incorrect — change not authorised." };
  }

  const [bankCode, ...nameParts] = parsed.data.bank.split("|");
  const validation = await validateSettlementAccount(
    parsed.data.accountNumber,
    bankCode ?? ""
  );
  if (validation.status === "INVALID_ACCOUNT") {
    return { ...EMPTY, error: validation.message ?? "Account could not be resolved." };
  }

  try {
    const result = await saveSettlementAccount({
      merchantId: session.merchantId,
      bankCode: bankCode ?? "",
      bankName: nameParts.join("|"),
      accountNumber: parsed.data.accountNumber,
      resolvedAccountName:
        validation.status === "VALIDATED" ? (validation.accountName ?? null) : null,
      actorEmail: session.email,
    });
    revalidatePath("/dashboard/settlement");
    return {
      error: null,
      resolvedAccountName: result.accountName,
      notice:
        result.subaccountStatus === "ACTIVE"
          ? null
          : (result.message ?? "Subaccount is not active yet."),
      done: true,
    };
  } catch (err) {
    return {
      ...EMPTY,
      error:
        err instanceof MerchantServiceError
          ? err.message
          : "Could not replace the settlement account.",
    };
  }
}
