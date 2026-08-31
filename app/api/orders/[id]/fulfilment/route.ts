import { NextRequest, NextResponse } from "next/server";
import type { FulfilmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canAccessBranch, getBusinessSession } from "@/lib/authz/business-access";
import { advanceFulfilment, FulfilmentError } from "@/lib/orders/fulfilment";

export const runtime = "nodejs";

const VALID: FulfilmentStatus[] = [
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

/**
 * Merchant-driven fulfilment progression. Authorizes the caller for the order's
 * branch, then advances the fulfilment status (forward only) and notifies the
 * customer on WhatsApp. Payment state is never touched here.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getBusinessSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, merchantId: true },
  });
  if (!order || !(await canAccessBranch(session, order.merchantId))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { to?: string };
  const to = body.to as FulfilmentStatus | undefined;
  if (!to || !VALID.includes(to)) {
    return NextResponse.json(
      { error: `invalid target status: ${body.to ?? "(none)"}` },
      { status: 400 }
    );
  }

  try {
    const result = await advanceFulfilment({
      orderId: order.id,
      to,
      actorType: "MERCHANT",
      actorId: session.userId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof FulfilmentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
