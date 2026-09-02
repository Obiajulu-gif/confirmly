import "server-only";
import { env, appUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { sendFlow } from "@/lib/whatsapp/client";
import { createFlowSession } from "@/lib/whatsapp/flow-session";

/** Public banner shown as the Flow launch card header (see public/whatsapp/). */
function orderBannerUrl(): string {
  return `${appUrl().replace(/\/$/, "")}/whatsapp/order-banner.jpg`;
}

async function storeHasStock(merchantId: string): Promise<boolean> {
  const count = await prisma.product.count({
    where: { merchantId, active: true, stockQuantity: { gt: 0 } },
  });
  return count > 0;
}

/**
 * Launches the native ordering Flow when it is configured, minting a stored
 * session so the data-exchange endpoint can validate the flow_token. Returns
 * false — without sending anything — when the Flow is disabled, unconfigured,
 * or every send attempt fails, so callers fall back to the interactive-list
 * experience in commerce-menu.ts. It never reports success it did not have.
 *
 * When `store` is supplied the Flow opens with `flow_action: "data_exchange"`,
 * so the endpoint serves the store's catalogue (SHOP) on the initial INIT
 * request — this both keeps the launch message tiny (the catalogue carries
 * Base64 images) and skips the global Search/Marketplace step. WhatsApp rejects
 * a `navigate` launch to a mid-flow screen (error 131009), which is why the
 * heavy SHOP data must NOT be embedded in the message. If that send fails we
 * fall back to a plain `navigate` launch on START before giving up.
 */
export async function maybeSendOrderFlow(
  waId: string,
  store?: { merchantId: string; storeName: string } | null
): Promise<boolean> {
  const settings = env();
  if (!settings.WHATSAPP_FLOW_ENABLED || !settings.WHATSAPP_ORDER_FLOW_ID) {
    return false;
  }
  const flowId = settings.WHATSAPP_ORDER_FLOW_ID;
  const banner = orderBannerUrl();

  // Preferred: open directly on the store's catalogue via an endpoint INIT.
  if (store) {
    try {
      if (!(await storeHasStock(store.merchantId))) return false;
      const { token } = await createFlowSession({
        waId,
        merchantId: store.merchantId,
        state: {
          merchantId: store.merchantId,
          storeName: store.storeName,
          shopMode: "catalogue",
        },
        currentScreen: "SHOP",
      });
      await sendFlow(waId, {
        flowId,
        flowToken: token,
        headerImageUrl: banner,
        bodyText:
          `🛍️ *Shop ${store.storeName} on WhatsApp*\n\n` +
          "Browse the catalogue, add items to your cart, choose delivery and pay — all right here.",
        cta: "Shop now",
        footerText: "Powered by Confirmly",
        flowAction: "data_exchange",
      });
      logger.info("whatsapp order Flow launched (store)", {
        waId,
        merchantId: store.merchantId,
      });
      return true;
    } catch (error) {
      logger.warn("store Flow launch failed; trying START launch", {
        reason: error instanceof Error ? error.message : "unknown",
      });
      // Fall through to the START launch below.
    }
  }

  // Global entry (or store fallback): open the Search/Marketplace start screen.
  try {
    const { token } = await createFlowSession({
      waId,
      ...(store
        ? {
            merchantId: store.merchantId,
            state: { merchantId: store.merchantId, storeName: store.storeName },
          }
        : {}),
    });
    await sendFlow(waId, {
      flowId,
      flowToken: token,
      headerImageUrl: banner,
      bodyText:
        "🛍️ *Shop on WhatsApp*\n\nOrder from local stores without leaving the chat. " +
        "Search for a shop or browse the marketplace, pick your items, and pay — all in one place.",
      cta: "Shop now",
      footerText: "Powered by Confirmly",
      flowAction: "navigate",
      screen: "START",
    });
    logger.info("whatsapp order Flow launched", { waId, store: Boolean(store) });
    return true;
  } catch (error) {
    logger.warn("whatsapp order Flow send failed; using interactive fallback", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}
