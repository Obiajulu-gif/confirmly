import "server-only";
import { prisma } from "@/lib/db";
import { env, isDemoMode } from "@/lib/env";
import { logger } from "@/lib/logger";
import { nairaAmountToKobo } from "@/lib/money";
import { generateInvoiceReference } from "@/lib/references";
import {
  createPayment as monnifyCreatePayment,
  verifyTransaction,
  queryTransactionByPaymentReference,
  type VerifiedTransaction,
} from "@/lib/monnify/client";
import { buildIncomeSplitConfig, type IncomeSplit } from "@/lib/monnify/checkout";
import { AUDIT, recordAudit } from "@/lib/orders/audit";
import { issueReceipt, receiptUrl } from "@/lib/receipts";
import type { Payment, PaymentState, Prisma } from "@prisma/client";

/**
 * The ONLY code path that can mark an order PAID is
 * `applyVerifiedTransaction`, and it exclusively consumes a transaction that
 * was verified server-to-server with Monnify. Webhook payloads, browser
 * redirects, screenshots and success pages never change payment state.
 */

// --- Payment creation -----------------------------------------------------------

/** Raised when the merchant's settlement profile blocks checkout. */
export class CheckoutBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutBlockedError";
  }
}

export async function createPaymentForOrder(orderId: string): Promise<{
  payment: Payment;
  checkoutUrl: string | null;
  virtualAccount: Record<string, unknown> | null;
}> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { customer: true, merchant: true, payment: true },
  });
  if (order.state === "PAID" || order.state === "COMPLETED") {
    throw new Error("order is already paid");
  }

  const attempt = (order.payment?.attempt ?? 0) + 1;
  const invoiceReference = generateInvoiceReference(order.reference, attempt);

  if (isDemoMode()) {
    // Clearly-labelled demo fallback: no provider call, no real payment.
    const payment = await upsertPaymentRow(order.id, {
      provider: "DEMO",
      state: "PENDING",
      invoiceReference,
      attempt,
      expectedAmountKobo: order.totalKobo,
      checkoutUrl: `${env().APP_URL}/pay/${order.reference}`,
      sanitizedResponse: { mode: "demo", note: "Demo Mode — no real payment" },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { state: "PAYMENT_PENDING" },
    });
    await recordAudit({
      merchantId: order.merchantId,
      orderId: order.id,
      conversationId: order.conversationId,
      event: AUDIT.MONNIFY_INVOICE_CREATED,
      actor: "SYSTEM",
      metadata: { invoiceReference, attempt, mode: "demo" },
    });
    return { payment, checkoutUrl: payment.checkoutUrl, virtualAccount: null };
  }

  // Merchant routing decision — the subaccount code is loaded from the
  // ORDER-OWNED merchant's payment profile, never from any client input.
  const profile = await prisma.merchantPaymentProfile.findFirst({
    where: { merchantId: order.merchantId, active: true },
    orderBy: { createdAt: "desc" },
  });
  let incomeSplitConfig: IncomeSplit[] | undefined;
  let routedToPlatform = false;
  if (env().MONNIFY_SUBACCOUNT_ENABLED) {
    if (profile?.subaccountStatus === "ACTIVE" && profile.subAccountCode) {
      incomeSplitConfig = buildIncomeSplitConfig(
        profile.subAccountCode,
        profile.splitPercentage
      );
    } else {
      // Never fall back silently to the platform account when merchant
      // routing is expected — block the checkout instead.
      throw new CheckoutBlockedError(
        "This shop's settlement account isn't active yet, so checkout is paused. The merchant has been notified."
      );
    }
  } else {
    // Subaccount feature disabled: platform-account routing, clearly flagged
    // and surfaced with a warning in the dashboard.
    routedToPlatform = true;
  }

  const created = await monnifyCreatePayment({
    invoiceReference,
    amountKobo: order.totalKobo,
    customerName: order.customer.name ?? "WhatsApp Customer",
    customerEmail: order.customer.email ?? `${order.customer.waId}@customers.confirmly.local`,
    description: `Order ${order.reference} — ${order.merchant.name}`,
    redirectUrl: `${env().APP_URL}/pay/${order.reference}`,
    incomeSplitConfig,
  });

  const payment = await upsertPaymentRow(order.id, {
    provider: "MONNIFY",
    state: "PENDING",
    invoiceReference,
    attempt,
    expectedAmountKobo: order.totalKobo,
    transactionReference: created.transactionReference,
    checkoutUrl: created.checkoutUrl,
    virtualAccount: (created.virtualAccount ?? undefined) as
      | Prisma.InputJsonValue
      | undefined,
    sanitizedResponse: created.sanitizedResponse as Prisma.InputJsonValue,
    subAccountCodeSnapshot: incomeSplitConfig?.[0]?.subAccountCode ?? null,
    splitPercentageSnapshot: incomeSplitConfig?.[0]?.splitPercentage ?? null,
    routedToPlatform,
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { state: "PAYMENT_PENDING" },
  });
  await recordAudit({
    merchantId: order.merchantId,
    orderId: order.id,
    conversationId: order.conversationId,
    event: AUDIT.MONNIFY_INVOICE_CREATED,
    actor: "SYSTEM",
    metadata: { invoiceReference, attempt, mode: created.mode },
  });

  return {
    payment,
    checkoutUrl: created.checkoutUrl,
    virtualAccount: created.virtualAccount as Record<string, unknown> | null,
  };
}

async function upsertPaymentRow(
  orderId: string,
  data: {
    provider: "MONNIFY" | "DEMO";
    state: PaymentState;
    invoiceReference: string;
    attempt: number;
    expectedAmountKobo: number;
    transactionReference?: string | null;
    checkoutUrl?: string | null;
    virtualAccount?: Prisma.InputJsonValue;
    sanitizedResponse?: Prisma.InputJsonValue;
    subAccountCodeSnapshot?: string | null;
    splitPercentageSnapshot?: number | null;
    routedToPlatform?: boolean;
  }
): Promise<Payment> {
  const existing = await prisma.payment.findUnique({ where: { orderId } });
  if (existing) {
    if (existing.state === "PAID") throw new Error("payment already PAID");
    return prisma.payment.update({
      where: { orderId },
      data: {
        provider: data.provider,
        state: data.state,
        invoiceReference: data.invoiceReference,
        attempt: data.attempt,
        expectedAmountKobo: data.expectedAmountKobo,
        transactionReference: data.transactionReference ?? null,
        paymentReference: null,
        checkoutUrl: data.checkoutUrl ?? null,
        virtualAccount: data.virtualAccount,
        sanitizedResponse: data.sanitizedResponse,
        subAccountCodeSnapshot: data.subAccountCodeSnapshot ?? null,
        splitPercentageSnapshot: data.splitPercentageSnapshot ?? null,
        routedToPlatform: data.routedToPlatform ?? false,
        verifiedAt: null,
        paidAmountKobo: 0,
        method: null,
      },
    });
  }
  return prisma.payment.create({
    data: {
      orderId,
      provider: data.provider,
      state: data.state,
      invoiceReference: data.invoiceReference,
      attempt: data.attempt,
      expectedAmountKobo: data.expectedAmountKobo,
      transactionReference: data.transactionReference ?? null,
      checkoutUrl: data.checkoutUrl ?? null,
      virtualAccount: data.virtualAccount,
      sanitizedResponse: data.sanitizedResponse,
      subAccountCodeSnapshot: data.subAccountCodeSnapshot ?? null,
      splitPercentageSnapshot: data.splitPercentageSnapshot ?? null,
      routedToPlatform: data.routedToPlatform ?? false,
    },
  });
}

// --- Verified-transaction application -------------------------------------------

export interface ApplyResult {
  paymentState: PaymentState;
  transitionedToPaid: boolean;
  receiptToken: string | null;
  orderId: string;
  merchantId: string;
}

function mapProviderStatus(
  verified: VerifiedTransaction,
  expectedKobo: number
): { state: PaymentState; paidKobo: number } {
  const paidKobo = verified.amountPaidNaira
    ? nairaAmountToKobo(verified.amountPaidNaira)
    : 0;
  const status = verified.paymentStatus.toUpperCase();

  if (status === "PAID" || status === "OVERPAID" || status === "PARTIALLY_PAID") {
    if (paidKobo > expectedKobo) return { state: "OVERPAID", paidKobo };
    if (paidKobo < expectedKobo) return { state: "PARTIALLY_PAID", paidKobo };
    return { state: "PAID", paidKobo };
  }
  if (status === "PENDING") return { state: "PENDING", paidKobo };
  if (status === "EXPIRED") return { state: "EXPIRED", paidKobo };
  if (status === "REVERSED") return { state: "REVERSED", paidKobo };
  if (status === "FAILED" || status === "CANCELLED") {
    return { state: "FAILED", paidKobo };
  }
  return { state: "PENDING", paidKobo };
}

/**
 * Applies a server-verified Monnify transaction to a payment + order in one
 * database transaction. Idempotent: re-applying the same verified state is a
 * no-op and never duplicates receipts.
 */
export async function applyVerifiedTransaction(
  paymentId: string,
  verified: VerifiedTransaction
): Promise<ApplyResult> {
  if (verified.currencyCode && verified.currencyCode !== "NGN") {
    throw new Error(`unexpected currency: ${verified.currencyCode}`);
  }

  return prisma.$transaction(
    async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { order: true },
    });
    const wasPaid = payment.state === "PAID";
    const { state, paidKobo } = mapProviderStatus(
      verified,
      payment.expectedAmountKobo
    );

    // A PAID payment is final — never downgraded by late/duplicate events.
    const nextState = wasPaid ? "PAID" : state;

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        state: nextState,
        paidAmountKobo: Math.max(paidKobo, wasPaid ? payment.paidAmountKobo : 0),
        method: verified.paymentMethod ?? payment.method,
        transactionReference:
          payment.transactionReference ?? verified.transactionReference,
        paymentReference: payment.paymentReference ?? verified.paymentReference,
        sanitizedResponse: verified.sanitizedResponse as Prisma.InputJsonValue,
        verifiedAt: new Date(),
      },
    });

    const transitionedToPaid = !wasPaid && nextState === "PAID";
    let receiptToken: string | null = null;

    if (transitionedToPaid) {
      await tx.order.update({
        where: { id: payment.orderId },
        data: { state: "PAID", paidAt: new Date() },
      });
      const { receipt } = await issueReceipt(payment.orderId, tx);
      receiptToken = receipt.token;

      // Payment verification and settlement are separate facts: verified
      // money creates a PENDING settlement; only a settlement event or
      // reconciliation may mark it SETTLED.
      const activeProfile = await tx.merchantPaymentProfile.findFirst({
        where: { merchantId: payment.order.merchantId, active: true },
      });
      await tx.settlement.upsert({
        where: { paymentId: payment.id },
        update: {},
        create: {
          paymentId: payment.id,
          merchantId: payment.order.merchantId,
          grossAmountKobo: paidKobo || payment.expectedAmountKobo,
          feeKobo: 0,
          netAmountKobo: paidKobo || payment.expectedAmountKobo,
          state: "PENDING",
          destinationMasked: payment.routedToPlatform
            ? "platform account"
            : (activeProfile?.accountNumberMasked ?? null),
        },
      });
      await recordAudit({
        tx,
        merchantId: payment.order.merchantId,
        orderId: payment.orderId,
        conversationId: payment.order.conversationId,
        event: "Settlement pending",
        actor: "SYSTEM",
      });
      await recordAudit({
        tx,
        merchantId: payment.order.merchantId,
        orderId: payment.orderId,
        conversationId: payment.order.conversationId,
        event: AUDIT.TRANSACTION_VERIFIED,
        actor: "PROVIDER",
        metadata: {
          paymentStatus: verified.paymentStatus,
          method: verified.paymentMethod,
        },
      });
      await recordAudit({
        tx,
        merchantId: payment.order.merchantId,
        orderId: payment.orderId,
        conversationId: payment.order.conversationId,
        event: AUDIT.ORDER_PAID,
        actor: "SYSTEM",
      });
      await recordAudit({
        tx,
        merchantId: payment.order.merchantId,
        orderId: payment.orderId,
        conversationId: payment.order.conversationId,
        event: AUDIT.RECEIPT_GENERATED,
        actor: "SYSTEM",
      });
      await tx.conversation.updateMany({
        where: { id: payment.order.conversationId ?? "" },
        data: { state: "PAID" },
      });
    } else if (
      !wasPaid &&
      (nextState === "PARTIALLY_PAID" || nextState === "OVERPAID")
    ) {
      // Preserve the discrepancy for merchant review — never auto-fulfil.
      await tx.order.update({
        where: { id: payment.orderId },
        data: { state: "NEEDS_ATTENTION" },
      });
      await recordAudit({
        tx,
        merchantId: payment.order.merchantId,
        orderId: payment.orderId,
        conversationId: payment.order.conversationId,
        event: AUDIT.PAYMENT_EXCEPTION,
        actor: "PROVIDER",
        metadata: { state: nextState },
      });
    } else if (!wasPaid && nextState !== payment.state) {
      await recordAudit({
        tx,
        merchantId: payment.order.merchantId,
        orderId: payment.orderId,
        conversationId: payment.order.conversationId,
        event: AUDIT.TRANSACTION_VERIFIED,
        actor: "PROVIDER",
        metadata: { paymentStatus: verified.paymentStatus, state: nextState },
      });
    }

    return {
      paymentState: nextState,
      transitionedToPaid,
      receiptToken,
      orderId: payment.orderId,
      merchantId: payment.order.merchantId,
    };
    },
    // Generous limits: the transaction spans several audit writes and must
    // survive high-latency links to the database.
    { timeout: 25_000, maxWait: 10_000 }
  );
}

// --- Verification entry points --------------------------------------------------

/** Verifies one payment against Monnify and applies the result. */
export async function verifyAndApplyPayment(
  paymentId: string
): Promise<ApplyResult> {
  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
  });
  if (payment.provider === "DEMO") {
    throw new Error("demo payments cannot be verified against Monnify");
  }
  const verified = payment.transactionReference
    ? await verifyTransaction(payment.transactionReference)
    : await queryTransactionByPaymentReference(payment.invoiceReference);
  return applyVerifiedTransaction(payment.id, verified);
}

/** Sends the WhatsApp receipt exactly once per PAID transition. */
export async function sendPaidNotification(result: ApplyResult) {
  if (!result.transitionedToPaid || !result.receiptToken) return;
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: result.orderId },
    include: { customer: true },
  });
  const { buildReceiptText } = await import("@/lib/orders/summary");
  const { sendToCustomer } = await import("@/lib/orders/outbound");
  try {
    await sendToCustomer({
      merchantId: result.merchantId,
      customer: order.customer,
      conversationId: order.conversationId,
      kind: "text",
      text: buildReceiptText(receiptUrl(result.receiptToken), order.reference),
    });
    await recordAudit({
      merchantId: result.merchantId,
      orderId: result.orderId,
      conversationId: order.conversationId,
      event: AUDIT.WHATSAPP_CONFIRMATION_SENT,
      actor: "SYSTEM",
    });
  } catch (err) {
    logger.error("failed to send WhatsApp receipt", {
      orderId: result.orderId,
      reason: err instanceof Error ? err.message : "unknown",
    });
  }
}

// --- Reconciliation --------------------------------------------------------------

/**
 * Safety net for missed webhooks: re-verifies stale PENDING/CREATED payments
 * directly with Monnify.
 */
export async function reconcilePendingPayments(olderThanMinutes = 5): Promise<{
  checked: number;
  transitioned: number;
}> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const stale = await prisma.payment.findMany({
    where: {
      provider: "MONNIFY",
      state: { in: ["CREATED", "PENDING"] },
      updatedAt: { lt: cutoff },
    },
    take: 25,
    orderBy: { updatedAt: "asc" },
  });

  let transitioned = 0;
  for (const payment of stale) {
    try {
      const result = await verifyAndApplyPayment(payment.id);
      if (result.transitionedToPaid) {
        transitioned++;
        await sendPaidNotification(result);
      }
    } catch (err) {
      logger.warn("reconciliation check failed", {
        paymentId: payment.id,
        reason: err instanceof Error ? err.message : "unknown",
      });
    }
  }
  return { checked: stale.length, transitioned };
}
