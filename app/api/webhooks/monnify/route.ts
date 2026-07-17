import { NextRequest, NextResponse } from "next/server";
import { defer } from "@/lib/defer";
import { requireEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { verifyMonnifySignature } from "@/lib/monnify/signature";
import {
  registerMonnifyEvent,
  processMonnifyEvent,
} from "@/lib/payments/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Monnify webhook. Raw body first, HMAC-SHA512 `monnify-signature`
 * validation, unique event insert, fast 200, then server-to-server
 * verification before any state change.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("monnify-signature");

  let secretKey: string;
  try {
    secretKey = requireEnv("MONNIFY_SECRET_KEY").MONNIFY_SECRET_KEY;
  } catch {
    logger.error("monnify webhook hit but MONNIFY_SECRET_KEY is not configured");
    return new NextResponse("Not configured", { status: 503 });
  }

  if (!verifyMonnifySignature(rawBody, signature, secretKey)) {
    logger.warn("monnify webhook rejected: invalid signature");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const outcome = await registerMonnifyEvent(rawBody);
  if (!outcome.accepted) {
    // Signed but unusable — acknowledge to stop retries, log for review.
    return NextResponse.json({ received: true, note: "unrecognized payload" });
  }
  if (outcome.duplicate) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const eventKey = outcome.eventKey;
  if (eventKey) {
    defer(() => processMonnifyEvent(eventKey));
  }
  return NextResponse.json({ received: true });
}
