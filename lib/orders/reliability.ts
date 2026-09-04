import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendText } from "@/lib/whatsapp/client";

/** Give up after this many attempts so a permanently-failing send can't loop. */
const MAX_RETRIES = 3;
/** Only recover recent failures — an old one is stale to the customer. */
const WINDOW_MS = 24 * 60 * 60 * 1000;

function retryCountOf(payload: unknown): number {
  if (payload && typeof payload === "object" && "retryCount" in payload) {
    const n = Number((payload as { retryCount?: unknown }).retryCount);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Re-sends recently-FAILED outbound TEXT messages (a send that exhausted the
 * client's own 5xx/429 retries and was recorded FAILED by sendToCustomer). Safe
 * to run repeatedly: a FAILED status means the message genuinely did not send,
 * so re-sending delivers it; a success flips the row to QUEUED, and each
 * still-failing attempt is capped so it can't loop forever. Interactive
 * messages are skipped (their button/row labels aren't stored).
 */
export async function retryFailedOutbound(
  limit = 25
): Promise<{ scanned: number; recovered: number }> {
  const failed = await prisma.whatsAppMessage.findMany({
    where: {
      direction: "OUTBOUND",
      status: "FAILED",
      type: "TEXT",
      createdAt: { gte: new Date(Date.now() - WINDOW_MS) },
    },
    include: { customer: { select: { waId: true } } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let recovered = 0;
  for (const message of failed) {
    const attempts = retryCountOf(message.payload);
    if (attempts >= MAX_RETRIES || !message.customer || !message.textBody) {
      continue;
    }
    const basePayload =
      message.payload && typeof message.payload === "object"
        ? (message.payload as Record<string, unknown>)
        : {};
    try {
      const result = await sendText(message.customer.waId, message.textBody);
      await prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: {
          status: "QUEUED",
          providerMessageId: result.providerMessageId,
          payload: { ...basePayload, retriedAt: new Date().toISOString() },
        },
      });
      recovered++;
    } catch (err) {
      await prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: {
          payload: {
            ...basePayload,
            retryCount: attempts + 1,
            lastError: err instanceof Error ? err.message.slice(0, 200) : "unknown",
          },
        },
      });
    }
  }

  if (failed.length) {
    logger.info("failed-outbound retry pass", {
      scanned: failed.length,
      recovered,
    });
  }
  return { scanned: failed.length, recovered };
}
