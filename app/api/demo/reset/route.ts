import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { resetDemoData } from "@/lib/demo";
import { recordAudit } from "@/lib/orders/audit";

export const runtime = "nodejs";

/**
 * Platform-admin-only demo reset: wipes tagged demo orders and seeds fresh
 * fixtures for the admin's own store. Not exposed to merchants.
 */
export async function POST() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!session.merchantId) {
    return NextResponse.json({ error: "no store selected" }, { status: 400 });
  }
  try {
    const result = await resetDemoData(session.merchantId);
    await recordAudit({
      merchantId: session.merchantId,
      event: "Demo data reset",
      actor: "MERCHANT",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "reset failed" },
      { status: 500 }
    );
  }
}
