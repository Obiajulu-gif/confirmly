import "server-only";
import {
  authedRequest,
  isFeatureUnavailable,
  MonnifyError,
} from "@/lib/monnify/auth";
import { logger } from "@/lib/logger";

/**
 * Merchant subaccounts. Confirmly owns one Monnify platform account; every
 * merchant gets a subaccount so Monnify settles their share directly to
 * their registered bank account.
 *
 * Creation is idempotent: an existing subaccount for the same bank+account
 * is reused, never duplicated.
 */

export type SubaccountResult =
  | { status: "ACTIVE"; subAccountCode: string }
  | { status: "ACTIVATION_REQUIRED"; message: string }
  | { status: "FAILED"; message: string };

interface SubaccountBody {
  subAccountCode?: string;
  accountNumber?: string;
  bankCode?: string;
  currencyCode?: string;
  email?: string;
}

async function findExisting(
  accountNumber: string,
  bankCode: string
): Promise<string | null> {
  const data = await authedRequest<SubaccountBody[]>("/api/v1/sub-accounts");
  const list = Array.isArray(data.responseBody) ? data.responseBody : [];
  const match = list.find(
    (s) => s.accountNumber === accountNumber && s.bankCode === bankCode
  );
  return match?.subAccountCode ?? null;
}

export async function ensureSubaccount(input: {
  bankCode: string;
  accountNumber: string;
  email: string;
  splitPercentage: number;
}): Promise<SubaccountResult> {
  try {
    // Idempotency: reuse an existing subaccount for the same destination.
    const existing = await findExisting(input.accountNumber, input.bankCode);
    if (existing) {
      return { status: "ACTIVE", subAccountCode: existing };
    }

    const data = await authedRequest<SubaccountBody[]>("/api/v1/sub-accounts", {
      method: "POST",
      body: [
        {
          currencyCode: "NGN",
          bankCode: input.bankCode,
          accountNumber: input.accountNumber,
          email: input.email,
          defaultSplitPercentage: input.splitPercentage,
        },
      ],
    });
    const created = Array.isArray(data.responseBody)
      ? data.responseBody[0]
      : (data.responseBody as SubaccountBody | undefined);
    if (created?.subAccountCode) {
      return { status: "ACTIVE", subAccountCode: created.subAccountCode };
    }
    return {
      status: "FAILED",
      message: "Monnify returned no subaccount code.",
    };
  } catch (err) {
    if (isFeatureUnavailable(err)) {
      logger.warn("monnify subaccount feature unavailable", {
        reason: err instanceof MonnifyError ? err.message : "unknown",
      });
      return {
        status: "ACTIVATION_REQUIRED",
        message:
          "The Sub Account feature is not enabled on the platform's Monnify sandbox account. Enable it in the Monnify dashboard (or contact Monnify support), then re-run setup.",
      };
    }
    return {
      status: "FAILED",
      message: err instanceof Error ? err.message : "subaccount creation failed",
    };
  }
}
