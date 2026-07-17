import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createPaymentForOrder } from "@/lib/payments/service";
import { sendToCustomer } from "@/lib/orders/outbound";
import { buildPaymentLinkText } from "@/lib/orders/summary";
import { AUDIT, recordAudit } from "@/lib/orders/audit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Creates a fresh Monnify invoice (always a NEW unique reference) for an
 * unpaid order and re-sends the payment link on WhatsApp.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: { id, merchantId: session.merchantId },
    include: { customer: true },
  });
  if (!order) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (order.state === "PAID" || order.state === "COMPLETED") {
    return NextResponse.json(
      { error: "order is already paid — a new invoice is not allowed" },
      { status: 409 }
    );
  }

  try {
    const { payment, checkoutUrl } = await createPaymentForOrder(order.id);
    if (checkoutUrl) {
      try {
        await sendToCustomer({
          merchantId: session.merchantId,
          customer: order.customer,
          conversationId: order.conversationId,
          kind: "text",
          text: buildPaymentLinkText(order.totalKobo, order.reference, checkoutUrl),
        });
        await recordAudit({
          merchantId: session.merchantId,
          orderId: order.id,
          event: AUDIT.PAYMENT_LINK_SENT,
          actor: "MERCHANT",
          metadata: { invoiceReference: payment.invoiceReference },
        });
      } catch (err) {
        logger.warn("invoice created but WhatsApp send failed", {
          orderId: order.id,
          reason: err instanceof Error ? err.message : "unknown",
        });
      }
    }
    return NextResponse.json({
      ok: true,
      invoiceReference: payment.invoiceReference,
      checkoutUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "invoice creation failed" },
      { status: 502 }
    );
  }
}
