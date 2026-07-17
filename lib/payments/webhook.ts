import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { webhookEventKey } from "@/lib/references";
import { verifyTransaction } from "@/lib/monnify/client";
import {
  applyVerifiedTransaction,
  sendPaidNotification,
} from "@/lib/payments/service";
import { AUDIT, recordAudit } from "@/lib/orders/audit";

/**
 * Monnify webhook processing. The webhook body is only a HINT — the payment
 * state applied to the database always comes from a direct server-to-server
 * verification call to Monnify.
 */

const monnifyWebhookSchema = z.object({
  eventType: z.string(),
  eventData: z
    .object({
      transactionReference: z.string().optional(),
      paymentReference: z.string().optional(),
      paymentStatus: z.string().optional(),
      amountPaid: z.union([z.number(), z.string()]).optional(),
      totalPayable: z.union([z.number(), z.string()]).optional(),
      paidOn: z.string().optional(),
      paymentMethod: z.string().optional(),
      currency: z.string().optional(),
      product: z
        .object({ reference: z.string().optional(), type: z.string().optional() })
        .optional(),
    })
    .passthrough(),
});

export interface MonnifyWebhookOutcome {
  accepted: boolean;
  duplicate: boolean;
  eventKey: string | null;
}

/** Validates shape + stores the event exactly once. Fast path for the route. */
export async function registerMonnifyEvent(
  rawBody: string
): Promise<MonnifyWebhookOutcome> {
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return { accepted: false, duplicate: false, eventKey: null };
  }
  const parsed = monnifyWebhookSchema.safeParse(parsedBody);
  if (!parsed.success) {
    logger.warn("monnify webhook: unrecognized payload shape");
    return { accepted: false, duplicate: false, eventKey: null };
  }
  const { eventType, eventData } = parsed.data;
  const reference =
    eventData.transactionReference ??
    eventData.paymentReference ??
    eventData.product?.reference;
  if (!reference) {
    return { accepted: false, duplicate: false, eventKey: null };
  }
  const eventKey = webhookEventKey("monnify", [eventType, reference]);

  try {
    await prisma.webhookEvent.create({
      data: {
        provider: "MONNIFY",
        providerEventKey: eventKey,
        eventType,
        payload: {
          eventType,
          transactionReference: eventData.transactionReference,
          paymentReference: eventData.paymentReference,
          paymentStatus: eventData.paymentStatus,
          amountPaid: eventData.amountPaid,
          totalPayable: eventData.totalPayable,
          paymentMethod: eventData.paymentMethod,
          currency: eventData.currency,
          productReference: eventData.product?.reference,
        },
        state: "RECEIVED",
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      logger.info("duplicate monnify webhook ignored", { eventKey });
      return { accepted: true, duplicate: true, eventKey };
    }
    throw err;
  }
  return { accepted: true, duplicate: false, eventKey };
}

/** Slow path: verify with Monnify and apply. Runs after the 200 response. */
export async function processMonnifyEvent(eventKey: string): Promise<void> {
  const event = await prisma.webhookEvent.findUnique({
    where: { providerEventKey: eventKey },
  });
  if (!event || event.state === "PROCESSED") return;

  const payload = event.payload as {
    transactionReference?: string;
    paymentReference?: string;
    productReference?: string;
  };

  try {
    const payment = await findPayment(payload);
    if (!payment) {
      await prisma.webhookEvent.update({
        where: { providerEventKey: eventKey },
        data: {
          state: "IGNORED",
          attempts: { increment: 1 },
          errorSummary: "no matching payment",
          processedAt: new Date(),
        },
      });
      return;
    }

    await recordAudit({
      merchantId: (
        await prisma.order.findUniqueOrThrow({ where: { id: payment.orderId } })
      ).merchantId,
      orderId: payment.orderId,
      event: AUDIT.WEBHOOK_RECEIVED,
      actor: "PROVIDER",
      metadata: { eventType: event.eventType },
    });

    // Authoritative verification — never trust the webhook body.
    const reference =
      payment.transactionReference ?? payload.transactionReference;
    if (!reference) {
      throw new Error("no transaction reference available for verification");
    }
    const verified = await verifyTransaction(reference);
    const result = await applyVerifiedTransaction(payment.id, verified);
    await sendPaidNotification(result);

    await prisma.webhookEvent.update({
      where: { providerEventKey: eventKey },
      data: {
        state: "PROCESSED",
        attempts: { increment: 1 },
        processedAt: new Date(),
      },
    });
  } catch (err) {
    logger.error("monnify webhook processing failed", {
      eventKey,
      reason: err instanceof Error ? err.message : "unknown",
    });
    await prisma.webhookEvent.update({
      where: { providerEventKey: eventKey },
      data: {
        state: "FAILED",
        attempts: { increment: 1 },
        errorSummary: err instanceof Error ? err.message.slice(0, 300) : "unknown",
      },
    });
  }
}

async function findPayment(payload: {
  transactionReference?: string;
  paymentReference?: string;
  productReference?: string;
}) {
  const candidates = [
    payload.paymentReference,
    payload.productReference,
  ].filter((v): v is string => Boolean(v));

  if (payload.transactionReference) {
    const byTransaction = await prisma.payment.findUnique({
      where: { transactionReference: payload.transactionReference },
    });
    if (byTransaction) return byTransaction;
  }
  for (const reference of candidates) {
    const byInvoice = await prisma.payment.findUnique({
      where: { invoiceReference: reference },
    });
    if (byInvoice) return byInvoice;
    const byPaymentRef = await prisma.payment.findUnique({
      where: { paymentReference: reference },
    });
    if (byPaymentRef) return byPaymentRef;
  }
  return null;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}
