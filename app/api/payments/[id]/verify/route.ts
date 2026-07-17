import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMerchantSession } from "@/lib/auth";
import {
  verifyAndApplyPayment,
  sendPaidNotification,
} from "@/lib/payments/service";

export const runtime = "nodejs";

/**
 * Merchant-triggered live verification against Monnify. This is the same
 * trusted path the webhook uses — the response from Monnify decides, nothing
 * else.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getMerchantSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const payment = await prisma.payment.findFirst({
    where: { id, order: { merchantId: session.merchantId } },
  });
  if (!payment) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    const result = await verifyAndApplyPayment(payment.id);
    await sendPaidNotification(result);
    return NextResponse.json({
      ok: true,
      state: result.paymentState,
      transitionedToPaid: result.transitionedToPaid,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "verification failed" },
      { status: 502 }
    );
  }
}
