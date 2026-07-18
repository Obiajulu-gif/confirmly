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
import { preprocessCommerceMessage } from "@/lib/whatsapp/commerce-menu";
import { processInboundMessage } from "@/lib/orders/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Meta webhook verification challenge. */
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
 * Signed inbound WhatsApp webhook. We acknowledge quickly and perform
 * idempotent processing afterwards. Clickable store/category/product actions
 * are handled deterministically before free text is passed to NVIDIA.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  let appSecret: string;
  try {
    appSecret = requireEnv("WHATSAPP_APP_SECRET").WHATSAPP_APP_SECRET;
  } catch {
    logger.error(
      "whatsapp webhook hit but WHATSAPP_APP_SECRET is not configured"
    );
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
    logger.warn("whatsapp webhook: unrecognized payload shape");
    return NextResponse.json({ received: true });
  }

  const webhook = parseWebhookPayload(parsed.data);

  const configuredPhoneId = env().WHATSAPP_PHONE_NUMBER_ID;
  if (
    webhook.phoneNumberId &&
    configuredPhoneId &&
    webhook.phoneNumberId !== configuredPhoneId
  ) {
    logger.warn("whatsapp webhook for unknown phone_number_id ignored");
    return NextResponse.json({ received: true });
  }

  // Only newly inserted provider events are processed. This protects the menu
  // layer as well as the order engine from Meta webhook retries.
  const newMessageIds = new Set<string>();
  for (const message of webhook.messages) {
    try {
      await prisma.webhookEvent.create({
        data: {
          provider: "WHATSAPP",
          providerEventKey: webhookEventKey("wa", [
            "msg",
            message.providerMessageId,
          ]),
          eventType: `message.${message.kind}`,
          payload: sanitizeInboundPayload(message),
          state: "RECEIVED",
        },
      });
      newMessageIds.add(message.providerMessageId);
    } catch {
      logger.info("duplicate WhatsApp webhook ignored", {
        providerMessageId: message.providerMessageId,
      });
    }
  }

  defer(async () => {
    for (const message of webhook.messages) {
      if (!newMessageIds.has(message.providerMessageId)) continue;
      try {
        const menuResult = await preprocessCommerceMessage(message);
        if (!menuResult.handled) {
          await processInboundMessage(menuResult.forwardedMessage ?? message);
        }
        await prisma.webhookEvent.updateMany({
          where: {
            providerEventKey: webhookEventKey("wa", [
              "msg",
              message.providerMessageId,
            ]),
          },
          data: {
            state: "PROCESSED",
            processedAt: new Date(),
            attempts: { increment: 1 },
          },
        });
      } catch (err) {
        logger.error("inbound processing failed", {
          providerMessageId: message.providerMessageId,
          reason: err instanceof Error ? err.message : "unknown",
        });
        await prisma.webhookEvent.updateMany({
          where: {
            providerEventKey: webhookEventKey("wa", [
              "msg",
              message.providerMessageId,
            ]),
          },
          data: {
            state: "FAILED",
            attempts: { increment: 1 },
            errorSummary:
              err instanceof Error ? err.message.slice(0, 300) : "unknown",
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
