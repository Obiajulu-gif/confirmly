import { NextRequest, NextResponse } from "next/server";
import { getMerchantSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { prewarmProductImages } from "@/lib/ai/product-image-prewarm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SCHEDULE = "45 0 * * *";

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  if (secret) return authorization === `Bearer ${secret}`;

  // Vercel adds the schedule header to cron invocations. This fallback keeps the
  // MVP operational until CRON_SECRET is configured; production should still
  // set CRON_SECRET so Vercel sends a signed Authorization header.
  const schedule = request.headers.get("x-vercel-cron-schedule");
  const userAgent = request.headers.get("user-agent") ?? "";
  return schedule === CRON_SCHEDULE && /vercel-cron/i.test(userAgent);
}

async function runPrewarm(merchantId?: string) {
  return prewarmProductImages({
    merchantId,
    limit: merchantId ? 2 : 3,
    autoApprove: true,
    maxAttempts: 1,
    timeoutMs: 40_000,
    steps: 1,
    maxRuntimeMs: 52_000,
    retryAfterMinutes: 30,
  });
}

/** Daily Vercel Cron backfill for every active store. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runPrewarm();
  logger.info("scheduled product image prewarm completed", result);
  return NextResponse.json({ ok: true, ...result });
}

/** Signed-in merchants can also start an immediate store-scoped backfill. */
export async function POST() {
  const session = await getMerchantSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runPrewarm(session.merchantId);
  logger.info("merchant product image prewarm completed", {
    merchantId: session.merchantId,
    ...result,
  });
  return NextResponse.json({ ok: true, ...result });
}
