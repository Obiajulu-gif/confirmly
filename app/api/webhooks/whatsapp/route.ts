import { NextRequest, NextResponse } from "next/server";
import { defer } from "@/lib/defer";
import { prisma } from "@/lib/db";
import { env, requireEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { webhookEventKey } from "@/lib/references";
import { verifyMetaSignature } from "@/lib/whatsapp/signature";
import {
  parseWebhookPayload,
  sanitizeInboundPayload,
  waWebhookSchema,
} from "@/lib/whatsapp/types";
import { processInboundMessage } from "@/lib/orders/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — Meta webhook verification challenge.
 * Returns ONLY the challenge on a token match; 403 otherwise.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  const expected = env().WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * POST — inbound messages and status updates.
 * Raw body is read before parsing; X-Hub-Signature-256 is validated with
 * HMAC-SHA256. Invalid signatures get 401. Processing happens after the 200
 * is returned (Next.js `after`), and unique provider message ids make
 * duplicate deliveries harmless.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  let appSecret: string;
  try {
    appSecret = requireEnv("WHATSAPP_APP_SECRET").WHATSAPP_APP_SECRET;
  } catch {
    logger.error("whatsapp webhook hit but WHATSAPP_APP_SECRET is not configured");
    return new NextResponse("Not configured", { status: 503 });
  }

  if (!verifyMetaSignature(rawBody, signature, appSecret)) {
    logger.warn("whatsapp webhook rejected: invalid signature");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }
  const parsed = waWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    // Signed but unexpected shape — acknowledge so Meta doesn't retry forever.
    logger.warn("whatsapp webhook: unrecognized payload shape");
    return NextResponse.json({ received: true });
  }

  const webhook = parseWebhookPayload(parsed.data);

  // Tenant safety: only process events for the configured phone number.
  const configuredPhoneId = env().WHATSAPP_PHONE_NUMBER_ID;
  if (
    webhook.phoneNumberId &&
    configuredPhoneId &&
    webhook.phoneNumberId !== configuredPhoneId
  ) {
    logger.warn("whatsapp webhook for unknown phone_number_id ignored");
    return NextResponse.json({ received: true });
  }

  const merchant = await prisma.merchant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!merchant) {
    logger.error("whatsapp webhook: no merchant provisioned");
    return NextResponse.json({ received: true });
  }

  // Record sanitized events for auditability (idempotent on the event key).
  for (const message of webhook.messages) {
    try {
      await prisma.webhookEvent.create({
        data: {
          provider: "WHATSAPP",
          providerEventKey: webhookEventKey("wa", ["msg", message.providerMessageId]),
          eventType: `message.${message.kind}`,
          payload: sanitizeInboundPayload(message),
          state: "RECEIVED",
        },
      });
    } catch {
      /* duplicate delivery — the unique key absorbs it */
    }
  }

  // Respond fast; process afterwards.
  defer(async () => {
    for (const message of webhook.messages) {
      try {
        await processInboundMessage(merchant.id, message);
        await prisma.webhookEvent.updateMany({
          where: {
            providerEventKey: webhookEventKey("wa", ["msg", message.providerMessageId]),
          },
          data: { state: "PROCESSED", processedAt: new Date(), attempts: { increment: 1 } },
        });
      } catch (err) {
        logger.error("inbound processing failed", {
          providerMessageId: message.providerMessageId,
          reason: err instanceof Error ? err.message : "unknown",
        });
        await prisma.webhookEvent.updateMany({
          where: {
            providerEventKey: webhookEventKey("wa", ["msg", message.providerMessageId]),
          },
          data: {
            state: "FAILED",
            attempts: { increment: 1 },
            errorSummary: err instanceof Error ? err.message.slice(0, 300) : "unknown",
          },
        });
      }
    }
    for (const status of webhook.statuses) {
      try {
        await prisma.whatsAppMessage.updateMany({
          where: { providerMessageId: status.providerMessageId },
          data: {
            status:
              status.status === "sent"
                ? "SENT"
                : status.status === "delivered"
                  ? "DELIVERED"
                  : status.status === "read"
                    ? "READ"
                    : status.status === "failed"
                      ? "FAILED"
                      : "QUEUED",
          },
        });
      } catch (err) {
        logger.warn("status update failed", {
          reason: err instanceof Error ? err.message : "unknown",
        });
      }
    }
  });

  return NextResponse.json({ received: true });
}
