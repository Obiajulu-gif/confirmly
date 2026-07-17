import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AUDIT, recordAudit } from "@/lib/orders/audit";

export const runtime = "nodejs";

/**
 * Merchant fulfilment progression. PAID → FULFILLING → COMPLETED, and
 * NEEDS_ATTENTION → FULFILLING after explicit review. Payment state itself is
 * untouchable here — only verified Monnify responses change it.
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
  });
  if (!order) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const nextState =
    order.state === "PAID" || order.state === "NEEDS_ATTENTION"
      ? "FULFILLING"
      : order.state === "FULFILLING"
        ? "COMPLETED"
        : null;
  if (!nextState) {
    return NextResponse.json(
      { error: `order in state ${order.state} cannot be progressed` },
      { status: 409 }
    );
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      state: nextState,
      ...(nextState === "COMPLETED" ? { fulfilledAt: new Date() } : {}),
    },
  });
  await recordAudit({
    merchantId: session.merchantId,
    orderId: order.id,
    conversationId: order.conversationId,
    event:
      nextState === "FULFILLING" ? "Fulfilment started" : "Order completed",
    actor: "MERCHANT",
    metadata: { from: order.state, to: nextState },
  });
  if (order.state === "NEEDS_ATTENTION") {
    await recordAudit({
      merchantId: session.merchantId,
      orderId: order.id,
      event: AUDIT.PAYMENT_EXCEPTION,
      actor: "MERCHANT",
      metadata: { note: "reviewed and approved by merchant" },
    });
  }
  return NextResponse.json({ ok: true, state: updated.state });
}
