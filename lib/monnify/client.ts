import "server-only";
import { requireEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { koboToNairaAmount } from "@/lib/money";

/**
 * Monnify sandbox client. Server-side only — the bearer token, API key and
 * secret never reach the browser.
 */

export class MonnifyError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly responseCode: string | null = null
  ) {
    super(message);
    this.name = "MonnifyError";
  }
}

interface MonnifyEnvelope<T> {
  requestSuccessful: boolean;
  responseMessage: string;
  responseCode: string;
  responseBody: T;
}

// --- Auth token cache -------------------------------------------------------

let cachedToken: { token: string; expiresAt: number } | null = null;

export function clearTokenCache() {
  cachedToken = null;
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  const e = requireEnv("MONNIFY_API_KEY", "MONNIFY_SECRET_KEY");
  const basic = Buffer.from(
    `${e.MONNIFY_API_KEY}:${e.MONNIFY_SECRET_KEY}`
  ).toString("base64");

  const response = await fetch(`${e.MONNIFY_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new MonnifyError(`auth failed: HTTP ${response.status}`, response.status);
  }
  const data = (await response.json()) as MonnifyEnvelope<{
    accessToken: string;
    expiresIn: number;
  }>;
  if (!data.requestSuccessful || !data.responseBody?.accessToken) {
    throw new MonnifyError("auth failed: no token", response.status, data.responseCode);
  }
  // Cache slightly under the documented lifetime.
  const ttlMs = Math.max((data.responseBody.expiresIn - 60) * 1000, 30_000);
  cachedToken = {
    token: data.responseBody.accessToken,
    expiresAt: Date.now() + ttlMs,
  };
  return cachedToken.token;
}

async function authedRequest<T>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<MonnifyEnvelope<T>> {
  const e = requireEnv("MONNIFY_API_KEY", "MONNIFY_SECRET_KEY");
  const token = await getAccessToken();
  const response = await fetch(`${e.MONNIFY_BASE_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  let data: MonnifyEnvelope<T>;
  try {
    data = (await response.json()) as MonnifyEnvelope<T>;
  } catch {
    throw new MonnifyError(
      `invalid JSON from Monnify: HTTP ${response.status}`,
      response.status
    );
  }
  if (!response.ok || !data.requestSuccessful) {
    throw new MonnifyError(
      data.responseMessage || `HTTP ${response.status}`,
      response.status,
      data.responseCode ?? null
    );
  }
  return data;
}

// --- Payment creation ---------------------------------------------------------

export interface CreatedPayment {
  mode: "invoice" | "transaction";
  checkoutUrl: string | null;
  transactionReference: string | null;
  /** Virtual account details when the invoice flow provides them. */
  virtualAccount: {
    accountNumber?: string;
    accountName?: string;
    bankName?: string;
    expiresOn?: string;
  } | null;
  /** Sanitized response payload safe to persist. */
  sanitizedResponse: Record<string, unknown>;
}

export interface CreatePaymentInput {
  invoiceReference: string;
  amountKobo: number;
  customerName: string;
  customerEmail: string;
  description: string;
  redirectUrl: string;
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

/**
 * Creates a payment request for a confirmed order. Prefers the dynamic
 * invoice endpoint (checkout link + dedicated transfer account); falls back
 * to Initialize Transaction + hosted checkout when invoices are unavailable.
 */
export async function createPayment(
  input: CreatePaymentInput
): Promise<CreatedPayment> {
  const e = requireEnv("MONNIFY_CONTRACT_CODE");
  const amount = koboToNairaAmount(input.amountKobo);
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const expiryDate = expiry.toISOString().slice(0, 19).replace("T", " ");

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
      },
    };
  } catch (err) {
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
    },
  };
}

// --- Verification ---------------------------------------------------------------

export interface VerifiedTransaction {
  paymentStatus: string; // PAID | PENDING | FAILED | EXPIRED | ...
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
