import { NextRequest, NextResponse } from "next/server";
import { getMerchantSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prewarmProductImages } from "@/lib/ai/product-image-prewarm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SCHEDULE = "45 0 * * *";

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  if (secret && authorization === `Bearer ${secret}`) return true;
  if (secret) return false;
  // Fallback until CRON_SECRET is configured (Vercel signs cron requests).
  const schedule = request.headers.get("x-vercel-cron-schedule");
  const userAgent = request.headers.get("user-agent") ?? "";
  return schedule === CRON_SCHEDULE && /vercel-cron/i.test(userAgent);
}

/**
 * Runs several bounded prewarm passes within the function budget, generating
 * customer-ready illustrations (NVIDIA_IMAGE_STEPS, default 25 for flux.1-dev)
 * until the catalogue is covered or time runs out.
 */
async function sweep(merchantId?: string) {
  if (!env().NVIDIA_IMAGE_GENERATION_ENABLED) {
    return {
      disabled: true as const,
      checked: 0,
      generated: 0,
      approved: 0,
      failed: 0,
      skipped: 0,
      remaining: 0,
    };
  }
  const startedAt = Date.now();
  const totals = { checked: 0, generated: 0, approved: 0, failed: 0, skipped: 0 };
  for (let pass = 0; pass < 20 && Date.now() - startedAt < 50_000; pass++) {
    const result = await prewarmProductImages({
      merchantId,
      limit: 3,
      autoApprove: true,
      maxAttempts: 1,
      timeoutMs: 40_000,
      maxRuntimeMs: 52_000,
      retryAfterMinutes: 30,
    });
    if (result.disabled) {
      return { disabled: true as const, ...totals, remaining: 0 };
    }
    totals.checked += result.checked;
    totals.generated += result.generated;
    totals.approved += result.approved;
    totals.failed += result.failed;
    totals.skipped += result.skipped;
    if (result.checked === 0) break;
  }
  const remaining = await prisma.product.count({
    where: {
      active: true,
      merchant: { active: true },
      ...(merchantId ? { merchantId } : {}),
      OR: [
        { imageUrl: null },
        { imageSource: "AI_GENERATED", imageApprovedAt: null },
      ],
    },
  });
  return { disabled: false as const, ...totals, remaining };
}

/** Daily Vercel Cron backfill for every active store. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await sweep();
  logger.info("scheduled product image prewarm completed", result);
  return NextResponse.json({ ok: !result.disabled, ...result });
}

/**
 * On-demand sweep: a signed-in merchant (scoped to their store) or the CLI
 * script authorized by CRON_SECRET (whole catalogue).
 */
export async function POST(request: NextRequest) {
  const session = await getMerchantSession();
  if (session) {
    const result = await sweep(session.merchantId);
    logger.info("merchant product image prewarm completed", {
      merchantId: session.merchantId,
      ...result,
    });
    return NextResponse.json({ ok: !result.disabled, ...result });
  }
  if (isAuthorizedCron(request)) {
    const result = await sweep();
    return NextResponse.json({ ok: !result.disabled, ...result });
  }
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
