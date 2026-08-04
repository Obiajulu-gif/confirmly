"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMerchantRole } from "@/lib/authz/business-access";
import { prisma } from "@/lib/db";
import { nairaAmountToKobo } from "@/lib/money";
import { requestWithdrawal, WithdrawalError } from "@/lib/business/service";

export interface WithdrawState {
  error: string | null;
  ok: boolean;
}

const schema = z.object({ amountNaira: z.coerce.number().positive().max(1_000_000_000) });

export async function requestWithdrawalAction(
  _prev: WithdrawState,
  formData: FormData
): Promise<WithdrawState> {
  const session = await requireMerchantRole().catch(() => null);
  if (!session) return { error: "Only a Merchant can withdraw.", ok: false };

  const parsed = schema.safeParse({ amountNaira: formData.get("amountNaira") });
  if (!parsed.success) return { error: "Enter a valid amount.", ok: false };

  // Masked payout destination from the most recent active settlement profile.
  const profile = await prisma.merchantPaymentProfile.findFirst({
    where: { merchant: { businessId: session.businessId } },
    orderBy: { createdAt: "desc" },
    select: { accountNumberMasked: true, bankName: true },
  });

  try {
    await requestWithdrawal({
      businessId: session.businessId,
      userId: session.userId,
      amountKobo: nairaAmountToKobo(parsed.data.amountNaira),
      destinationMasked: profile
        ? `${profile.bankName} ••${profile.accountNumberMasked.slice(-4)}`
        : null,
    });
  } catch (err) {
    return {
      error: err instanceof WithdrawalError ? err.message : "Could not create the request.",
      ok: false,
    };
  }
  revalidatePath("/dashboard/withdrawals");
  return { error: null, ok: true };
}
