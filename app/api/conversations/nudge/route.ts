import { NextRequest, NextResponse } from "next/server";
import { getMerchantSession } from "@/lib/auth";
import { sendAbandonedOrderNudges } from "@/lib/orders/nudge";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Abandoned-order nudge job. Sends one gentle re-engagement to conversations
 * that stalled at confirmation/payment (see lib/orders/nudge.ts for the strict
 * eligibility rules). Off unless NUDGE_ENABLED. Callable by a signed-in
 * merchant or the Vercel cron (Authorization: Bearer CRON_SECRET).
 */
async function authorized(request: NextRequest): Promise<boolean> {
  const session = await getMerchantSession();
  if (session) return true;
  const cronSecret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  return Boolean(cronSecret && header === `Bearer ${cronSecret}`);
}

export async function POST(request: NextRequest) {
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await sendAbandonedOrderNudges();
  return NextResponse.json({ ok: true, ...result });
}

/** Vercel cron uses GET. */
export async function GET(request: NextRequest) {
  return POST(request);
}
