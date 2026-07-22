import "server-only";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { formatNaira } from "@/lib/money";
import { AUDIT, recordAudit } from "@/lib/orders/audit";
import {
  isNudgeEligible,
  MIN_IDLE_MINUTES,
  WINDOW_HOURS,
} from "@/lib/orders/nudge-policy";
import { sendToCustomer } from "@/lib/orders/outbound";

/**
 * Abandoned-order re-engagement. A conversation that stalled at
 * AWAITING_CONFIRMATION or PAYMENT_PENDING gets exactly one gentle nudge —
 * and only:
 *   • while it is still inside WhatsApp's 24-hour customer-service window
 *     (free-form messages are not allowed after that), and
 *   • after it has been idle for at least MIN_IDLE_MINUTES, and
 *   • when the customer has not opted out, and
 *   • when it has never been nudged before (lastNudgeAt is null).
 *
 * Off unless NUDGE_ENABLED — this is the only path that sends unsolicited
 * outbound messages, so it stays behind a flag.
 */

export interface NudgeResult {
  enabled: boolean;
  eligible: number;
  sent: number;
}

export async function sendAbandonedOrderNudges(
  limit = 25
): Promise<NudgeResult> {
  if (!env().NUDGE_ENABLED) {
    return { enabled: false, eligible: 0, sent: 0 };
  }

  const now = Date.now();
  const idleBefore = new Date(now - MIN_IDLE_MINUTES * 60_000);
  const windowStart = new Date(now - WINDOW_HOURS * 60 * 60_000);

  const conversations = await prisma.conversation.findMany({
    where: {
      automationMode: "AUTO",
      state: { in: ["AWAITING_CONFIRMATION", "PAYMENT_PENDING"] },
      lastNudgeAt: null,
      // Idle long enough to be "abandoned", but still inside the 24h window.
      lastInboundAt: { lte: idleBefore, gte: windowStart },
      customer: { optedIn: true },
    },
    include: { customer: true },
    orderBy: { lastInboundAt: "asc" },
    take: limit,
  });

  let sent = 0;
  for (const conversation of conversations) {
    // Belt-and-suspenders: re-check the pure policy on each row so a loosened
    // DB query can never send outside the eligibility rules.
    if (
      !isNudgeEligible(
        {
          state: conversation.state,
          automationMode: conversation.automationMode,
          lastInboundAt: conversation.lastInboundAt,
          lastNudgeAt: conversation.lastNudgeAt,
          optedIn: conversation.customer.optedIn,
        },
        now
      )
    ) {
      continue;
    }
    const message =
      conversation.state === "PAYMENT_PENDING"
        ? await paymentPendingText(conversation.merchantId, conversation.customerId)
        : "👋 Your order is ready to confirm whenever you are — just tap *Confirm* on the summary above, or reply *cart* to review it. Reply *cancel* if you've changed your mind.";

    try {
      await sendToCustomer({
        merchantId: conversation.merchantId,
        customer: conversation.customer,
        conversationId: conversation.id,
        kind: "text",
        text: message,
      });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastNudgeAt: new Date() },
      });
      await recordAudit({
        merchantId: conversation.merchantId,
        conversationId: conversation.id,
        event: AUDIT.NUDGE_SENT,
        actor: "SYSTEM",
        metadata: { state: conversation.state },
      });
      sent += 1;
    } catch (err) {
      logger.warn("nudge send failed", {
        conversationId: conversation.id,
        reason: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  logger.info("abandoned-order nudges run", {
    eligible: conversations.length,
    sent,
  });
  return { enabled: true, eligible: conversations.length, sent };
}

/** Builds a pay-reminder that references the pending order + amount. */
async function paymentPendingText(
  merchantId: string,
  customerId: string
): Promise<string> {
  const order = await prisma.order.findFirst({
    where: {
      merchantId,
      customerId,
      state: { in: ["PAYMENT_PENDING", "CONFIRMED"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (order) {
    return [
      `👋 Your order *${order.reference}* is still waiting for payment.`,
      "",
      `Amount due: *${formatNaira(order.totalKobo)}*`,
      "",
      "Reply *check payment* for the live status, or *cancel* to drop it. We verify every payment automatically — no screenshots needed.",
    ].join("\n");
  }
  return "👋 You have an order waiting for payment. Reply *check payment* for the live status, or *cancel* to drop it.";
}
