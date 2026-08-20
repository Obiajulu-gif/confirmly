import "server-only";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendFlow } from "@/lib/whatsapp/client";
import { createFlowSession } from "@/lib/whatsapp/flow-session";

/**
 * Launches the native ordering Flow when it is configured, minting a stored
 * session so the data-exchange endpoint can validate the flow_token. Returns
 * false — without sending anything — when the Flow is disabled, unconfigured,
 * or the send fails, so callers fall back to the interactive-list experience in
 * commerce-menu.ts exactly as before. It never reports success it did not have.
 */
export async function maybeSendOrderFlow(waId: string): Promise<boolean> {
  const settings = env();
  if (!settings.WHATSAPP_FLOW_ENABLED || !settings.WHATSAPP_ORDER_FLOW_ID) {
    return false;
  }

  try {
    const { token } = await createFlowSession({ waId });
    await sendFlow(waId, {
      flowId: settings.WHATSAPP_ORDER_FLOW_ID,
      flowToken: token,
      bodyText:
        "Order from local stores without leaving WhatsApp. Tap below to search or browse the marketplace.",
      cta: "Start order",
      screen: "START",
    });
    logger.info("whatsapp order Flow launched", { waId });
    return true;
  } catch (error) {
    logger.warn("whatsapp order Flow send failed; using interactive fallback", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}
