import { NextResponse } from "next/server";
import { getMerchantSession } from "@/lib/auth";
import { resetDemoData } from "@/lib/demo";
import { recordAudit } from "@/lib/orders/audit";

export const runtime = "nodejs";

/** Protected demo reset: wipes tagged demo orders and seeds fresh fixtures. */
export async function POST() {
  const session = await getMerchantSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
