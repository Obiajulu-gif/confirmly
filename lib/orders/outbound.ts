import "server-only";
import { prisma } from "@/lib/db";
import { isDemoMode } from "@/lib/env";
import { logger } from "@/lib/logger";
import { randomCode } from "@/lib/references";
import {
  sendText,
  sendButtons,
  sendList,
  type InteractiveButton,
  type ListRow,
} from "@/lib/whatsapp/client";
import type { Customer } from "@prisma/client";

export interface OutboundInput {
  merchantId: string;
  customer: Pick<Customer, "id" | "waId">;
  conversationId: string | null;
  kind: "text" | "buttons" | "list";
  text: string;
  buttons?: InteractiveButton[];
  listButtonLabel?: string;
  rows?: ListRow[];
}

/**
 * Sends a WhatsApp message and records it. In explicit Demo Mode no real
 * message is sent — the outbound row is stored with a demo id so the
 * dashboard transcript still works.
 */
export async function sendToCustomer(input: OutboundInput): Promise<string> {
  const messageType = input.kind === "text" ? "TEXT" : "INTERACTIVE";
  const payload =
    input.kind === "buttons"
      ? { buttons: input.buttons?.map((b) => b.id) }
      : input.kind === "list"
        ? { rows: input.rows?.map((r) => r.id) }
        : undefined;

  let providerMessageId: string;
  try {
    if (isDemoMode()) {
      providerMessageId = `demo-${randomCode(12)}`;
      logger.info("demo mode: outbound message not sent to Meta", {
        kind: input.kind,
      });
    } else if (input.kind === "buttons" && input.buttons?.length) {
      const r = await sendButtons(input.customer.waId, input.text, input.buttons);
      providerMessageId = r.providerMessageId;
    } else if (input.kind === "list" && input.rows?.length) {
      const r = await sendList(
        input.customer.waId,
        input.text,
        input.listButtonLabel ?? "Choose",
        input.rows
      );
      providerMessageId = r.providerMessageId;
    } else {
      const r = await sendText(input.customer.waId, input.text);
      providerMessageId = r.providerMessageId;
    }
  } catch (err) {
    // Record the failed send so it is visible in the transcript and never
    // silently dropped, then re-throw for the caller's error handling.
    await prisma.whatsAppMessage
      .create({
        data: {
          providerMessageId: `failed-${randomCode(12)}`,
          merchantId: input.merchantId,
          customerId: input.customer.id,
          conversationId: input.conversationId,
          direction: "OUTBOUND",
          type: messageType,
          textBody: input.text,
          status: "FAILED",
          payload: {
            ...(payload ?? {}),
            error: err instanceof Error ? err.message.slice(0, 300) : "send failed",
          },
        },
      })
      .catch(() => {});
    logger.warn("outbound send failed", {
      merchantId: input.merchantId,
      kind: input.kind,
      reason: err instanceof Error ? err.message : "unknown",
    });
    throw err;
  }

  await prisma.whatsAppMessage.create({
    data: {
      providerMessageId,
      merchantId: input.merchantId,
      customerId: input.customer.id,
      conversationId: input.conversationId,
      direction: "OUTBOUND",
      type: messageType,
      textBody: input.text,
      status: isDemoMode() ? "SENT" : "QUEUED",
      payload,
    },
  });
  if (input.conversationId) {
    await prisma.conversation.update({
      where: { id: input.conversationId },
      data: { lastOutboundAt: new Date() },
    });
  }
  return providerMessageId;
}
