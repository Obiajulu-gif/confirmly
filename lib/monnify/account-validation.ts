import "server-only";
import { z } from "zod";
import {
  authedRequest,
  isFeatureUnavailable,
  MonnifyError,
} from "@/lib/monnify/auth";
import { logger } from "@/lib/logger";

/**
 * Bank-account name enquiry. The resolved account name comes from Monnify —
 * merchants can never free-type a name after validation.
 */

const inputSchema = z.object({
  accountNumber: z.string().regex(/^\d{10}$/, "account number must be 10 digits"),
  bankCode: z.string().regex(/^\d{3,6}$/, "invalid bank code"),
});

export type AccountValidationResult =
  | { status: "VALIDATED"; accountName: string }
  | { status: "INVALID_ACCOUNT"; message: string }
  | { status: "FEATURE_UNAVAILABLE"; message: string }
  | { status: "PROVIDER_ERROR"; message: string };

interface EnquiryBody {
  accountNumber?: string;
  accountName?: string;
  bankCode?: string;
}

/** Tries the current (v2) enquiry endpoint, then the v1 fallback. */
export async function validateBankAccount(
  accountNumberRaw: string,
  bankCodeRaw: string
): Promise<AccountValidationResult> {
  const parsed = inputSchema.safeParse({
    accountNumber: accountNumberRaw.replace(/\D/g, ""),
    bankCode: bankCodeRaw.trim(),
  });
  if (!parsed.success) {
    return {
      status: "INVALID_ACCOUNT",
      message: parsed.error.issues[0]?.message ?? "invalid input",
    };
  }
  const { accountNumber, bankCode } = parsed.data;
  const query = `accountNumber=${accountNumber}&bankCode=${bankCode}`;
  const endpoints = [
    `/api/v2/disbursements/account/validate?${query}`,
    `/api/v1/disbursements/account/validate?${query}`,
  ];

  let lastError: MonnifyError | null = null;
  for (const endpoint of endpoints) {
    try {
      const data = await authedRequest<EnquiryBody>(endpoint);
      const accountName = data.responseBody?.accountName?.trim();
      if (accountName) return { status: "VALIDATED", accountName };
      return {
        status: "INVALID_ACCOUNT",
        message: "The bank returned no account name for these details.",
      };
    } catch (err) {
      if (err instanceof MonnifyError) {
        lastError = err;
        // Wrong details are a definitive answer — don't try other endpoints.
        if (
          err.status === 400 ||
          /invalid|not found|could not resolve|unable to validate/i.test(err.message)
        ) {
          return {
            status: "INVALID_ACCOUNT",
            message:
              "The account could not be resolved. Check the number and bank.",
          };
        }
        continue; // try the next endpoint version
      }
      throw err;
    }
  }

  if (lastError && isFeatureUnavailable(lastError)) {
    logger.warn("monnify account validation unavailable", {
      status: lastError.status,
    });
    return {
      status: "FEATURE_UNAVAILABLE",
      message:
        "Account validation is not enabled on this Monnify account yet.",
    };
  }
  return {
    status: "PROVIDER_ERROR",
    message: lastError?.message ?? "Monnify validation failed",
  };
}
