import "server-only";
import { requireEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { koboToNairaAmount } from "@/lib/money";
import {
  authedRequest,
  getAccessToken,
  clearTokenCache,
  MonnifyError,
} from "@/lib/monnify/auth";
import type { IncomeSplit } from "@/lib/monnify/checkout";

export { getAccessToken, clearTokenCache, MonnifyError };

/**
 * Payment creation + verification against the Monnify sandbox. Server-side
 * only. When an incomeSplitConfig is provided it is attached verbatim to the
 * provider request — a split is NEVER silently dropped or retried without.
 */

// --- Payment creation ---------------------------------------------------------

export interface CreatedPayment {
  mode: "invoice" | "transaction";
  checkoutUrl: string | null;
  transactionReference: string | null;
  virtualAccount: {
    accountNumber?: string;
    accountName?: string;
    bankName?: string;
    expiresOn?: string;
  } | null;
  sanitizedResponse: Record<string, unknown>;
}

export interface CreatePaymentInput {
  invoiceReference: string;
  amountKobo: number;
  customerName: string;
  customerEmail: string;
  description: string;
  redirectUrl: string;
  /** Merchant routing — validated upstream, totals exactly 100. */
  incomeSplitConfig?: IncomeSplit[];
}

interface InvoiceResponseBody {
  invoiceReference?: string;
  checkoutUrl?: string;
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
  expiryDate?: string;
  transactionReference?: string;
}

interface InitTransactionResponseBody {
  transactionReference?: string;
  paymentReference?: string;
  checkoutUrl?: string;
}

export async function createPayment(
  input: CreatePaymentInput
): Promise<CreatedPayment> {
  const e = requireEnv("MONNIFY_CONTRACT_CODE");
  const amount = koboToNairaAmount(input.amountKobo);
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const expiryDate = expiry.toISOString().slice(0, 19).replace("T", " ");
  const split = input.incomeSplitConfig?.length
    ? { incomeSplitConfig: input.incomeSplitConfig }
    : {};

  try {
    const data = await authedRequest<InvoiceResponseBody>(
      "/api/v1/invoice/create",
      {
        method: "POST",
        body: {
          amount,
          invoiceReference: input.invoiceReference,
          description: input.description.slice(0, 200),
          currencyCode: "NGN",
          contractCode: e.MONNIFY_CONTRACT_CODE,
          customerEmail: input.customerEmail,
          customerName: input.customerName.slice(0, 100),
          expiryDate,
          paymentMethods: [],
          redirectUrl: input.redirectUrl,
          ...split,
        },
      }
    );
    const body = data.responseBody;
    return {
      mode: "invoice",
      checkoutUrl: body.checkoutUrl ?? null,
      transactionReference: body.transactionReference ?? null,
      virtualAccount: body.accountNumber
        ? {
            accountNumber: body.accountNumber,
            accountName: body.accountName,
            bankName: body.bankName,
            expiresOn: body.expiryDate,
          }
        : null,
      sanitizedResponse: {
        mode: "invoice",
        invoiceReference: body.invoiceReference,
        hasCheckoutUrl: Boolean(body.checkoutUrl),
        bankName: body.bankName,
        expiryDate: body.expiryDate,
        responseCode: data.responseCode,
        splitAttached: Boolean(input.incomeSplitConfig?.length),
      },
    };
  } catch (err) {
    // The fallback path keeps the SAME split config — never dropped.
    logger.warn("monnify invoice creation failed, falling back to init-transaction", {
      reason: err instanceof Error ? err.message : "unknown",
    });
  }

  const data = await authedRequest<InitTransactionResponseBody>(
    "/api/v1/merchant/transactions/init-transaction",
    {
      method: "POST",
      body: {
        amount,
        customerName: input.customerName.slice(0, 100),
        customerEmail: input.customerEmail,
        paymentReference: input.invoiceReference,
        paymentDescription: input.description.slice(0, 200),
        currencyCode: "NGN",
        contractCode: e.MONNIFY_CONTRACT_CODE,
        redirectUrl: input.redirectUrl,
        paymentMethods: ["CARD", "ACCOUNT_TRANSFER", "USSD"],
        ...split,
      },
    }
  );
  const body = data.responseBody;
  return {
    mode: "transaction",
    checkoutUrl: body.checkoutUrl ?? null,
    transactionReference: body.transactionReference ?? null,
    virtualAccount: null,
    sanitizedResponse: {
      mode: "transaction",
      paymentReference: body.paymentReference,
      transactionReference: body.transactionReference,
      hasCheckoutUrl: Boolean(body.checkoutUrl),
      responseCode: data.responseCode,
      splitAttached: Boolean(input.incomeSplitConfig?.length),
    },
  };
}

// --- Verification ---------------------------------------------------------------

export interface VerifiedTransaction {
  paymentStatus: string;
  amountPaidNaira: number;
  totalPayableNaira: number;
  currencyCode: string | null;
  paymentMethod: string | null;
  transactionReference: string | null;
  paymentReference: string | null;
  paidOn: string | null;
  sanitizedResponse: Record<string, unknown>;
}

interface TransactionStatusBody {
  paymentStatus?: string;
  amountPaid?: number | string;
  totalPayable?: number | string;
  currencyCode?: string;
  paymentMethod?: string;
  transactionReference?: string;
  paymentReference?: string;
  paidOn?: string;
}

function toVerified(body: TransactionStatusBody): VerifiedTransaction {
  return {
    paymentStatus: body.paymentStatus ?? "UNKNOWN",
    amountPaidNaira: Number(body.amountPaid ?? 0),
    totalPayableNaira: Number(body.totalPayable ?? 0),
    currencyCode: body.currencyCode ?? null,
    paymentMethod: body.paymentMethod ?? null,
    transactionReference: body.transactionReference ?? null,
    paymentReference: body.paymentReference ?? null,
    paidOn: body.paidOn ?? null,
    sanitizedResponse: {
      paymentStatus: body.paymentStatus,
      amountPaid: body.amountPaid,
      totalPayable: body.totalPayable,
      currencyCode: body.currencyCode,
      paymentMethod: body.paymentMethod,
      transactionReference: body.transactionReference,
      paymentReference: body.paymentReference,
      paidOn: body.paidOn,
    },
  };
}

/** Verifies a transaction directly with Monnify by transaction reference. */
export async function verifyTransaction(
  transactionReference: string
): Promise<VerifiedTransaction> {
  const data = await authedRequest<TransactionStatusBody>(
    `/api/v2/transactions/${encodeURIComponent(transactionReference)}`
  );
  return toVerified(data.responseBody);
}

/** Queries by our payment/invoice reference (used by reconciliation). */
export async function queryTransactionByPaymentReference(
  paymentReference: string
): Promise<VerifiedTransaction> {
  const data = await authedRequest<TransactionStatusBody>(
    `/api/v2/merchant/transactions/query?paymentReference=${encodeURIComponent(
      paymentReference
    )}`
  );
  return toVerified(data.responseBody);
}

/** Connectivity probe for the settings/health page. */
export async function monnifyHealthCheck(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}
