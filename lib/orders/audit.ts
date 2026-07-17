import { prisma } from "@/lib/db";
import type { AuditActor, Prisma } from "@prisma/client";

/** Canonical audit event names — the order-details timeline renders these. */
export const AUDIT = {
  CUSTOMER_MESSAGE_RECEIVED: "Customer message received",
  ORDER_INTENT_EXTRACTED: "Order intent extracted",
  PRODUCT_MATCHED: "Product matched",
  CLARIFICATION_ASKED: "Clarification asked",
  ORDER_SUMMARY_SENT: "Order summary sent",
  CUSTOMER_CONFIRMED: "Customer confirmed",
  ORDER_CANCELLED: "Order cancelled",
  MONNIFY_INVOICE_CREATED: "Monnify invoice created",
  PAYMENT_LINK_SENT: "Payment link sent",
  WEBHOOK_RECEIVED: "Webhook received",
  TRANSACTION_VERIFIED: "Transaction verified",
  ORDER_PAID: "Order marked paid",
  PAYMENT_EXCEPTION: "Payment exception",
  RECEIPT_GENERATED: "Receipt generated",
  WHATSAPP_CONFIRMATION_SENT: "WhatsApp confirmation sent",
  HUMAN_TAKEOVER: "Human takeover",
  AUTOMATION_RESUMED: "Automation resumed",
  RECONCILIATION_RUN: "Reconciliation run",
} as const;

export async function recordAudit(input: {
  merchantId: string;
  event: string;
  actor?: AuditActor;
  orderId?: string | null;
  conversationId?: string | null;
  metadata?: Prisma.InputJsonValue;
  tx?: Prisma.TransactionClient;
}) {
  const db = input.tx ?? prisma;
  await db.auditEvent.create({
    data: {
      merchantId: input.merchantId,
      event: input.event,
      actor: input.actor ?? "SYSTEM",
      orderId: input.orderId ?? null,
      conversationId: input.conversationId ?? null,
      metadata: input.metadata,
    },
  });
}
