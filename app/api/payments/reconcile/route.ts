import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { reconcilePendingPayments } from "@/lib/payments/service";
import { AUDIT, recordAudit } from "@/lib/orders/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Reconciliation safety net: re-verifies stale pending payments directly with
 * Monnify. Recovers orders whose webhook was missed. Callable by a signed-in
 * merchant or by the Vercel cron (Authorization: Bearer CRON_SECRET).
 */
async function authorize(request: NextRequest): Promise<string | null> {
  const session = await getSession();
  if (session) return session.merchantId;
  const cronSecret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (cronSecret && header === `Bearer ${cronSecret}`) {
    const merchant = await prisma.merchant.findFirst({
      orderBy: { createdAt: "asc" },
    });
    return merchant?.id ?? null;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const merchantId = await authorize(request);
  if (!merchantId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await reconcilePendingPayments(2);
  await recordAudit({
    merchantId,
    event: AUDIT.RECONCILIATION_RUN,
    actor: "SYSTEM",
    metadata: result,
  });
  return NextResponse.json({ ok: true, ...result });
}

/** Vercel cron uses GET. */
export async function GET(request: NextRequest) {
  return POST(request);
}
