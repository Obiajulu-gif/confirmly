import "server-only";
import { env, appUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendFlow } from "@/lib/whatsapp/client";
import { createFlowSession } from "@/lib/whatsapp/flow-session";
import { buildShopScreen } from "@/lib/whatsapp/flow-screens";

/** Public banner shown as the Flow launch card header (see public/whatsapp/). */
function orderBannerUrl(): string {
  return `${appUrl().replace(/\/$/, "")}/whatsapp/order-banner.jpg`;
}

/**
 * Launches the native ordering Flow when it is configured, minting a stored
 * session so the data-exchange endpoint can validate the flow_token. Returns
 * false — without sending anything — when the Flow is disabled, unconfigured,
 * or the send fails, so callers fall back to the interactive-list experience in
 * commerce-menu.ts exactly as before. It never reports success it did not have.
 *
 * When `store` is supplied (the customer is already shopping a specific shop),
 * the Flow opens directly on that store's catalogue (the SHOP screen), skipping
 * the global Search/Marketplace start screen so a merchant-direct customer
 * never has to pick the shop again. Otherwise it opens on START.
 */
export async function maybeSendOrderFlow(
  waId: string,
  store?: { merchantId: string; storeName: string } | null
): Promise<boolean> {
  const settings = env();
  if (!settings.WHATSAPP_FLOW_ENABLED || !settings.WHATSAPP_ORDER_FLOW_ID) {
    return false;
  }

  try {
    if (store) {
      // Resolve the store's catalogue exactly as the endpoint would; the same
      // data shape is valid whether served here at launch or via data-exchange.
      const shop = await buildShopScreen(store.merchantId, {});
      if (shop.screen !== "SHOP" || shop.data.has_skus !== true) {
        // Store unavailable or has nothing in stock — let the caller fall back.
        return false;
      }
      const { token } = await createFlowSession({
        waId,
        merchantId: store.merchantId,
        state: { merchantId: store.merchantId, storeName: store.storeName },
        currentScreen: "SHOP",
      });
      await sendFlow(waId, {
        flowId: settings.WHATSAPP_ORDER_FLOW_ID,
        flowToken: token,
        headerImageUrl: orderBannerUrl(),
        bodyText:
          `🛍️ *Shop ${store.storeName} on WhatsApp*\n\n` +
          "Browse the catalogue, add items to your cart, choose delivery and pay — all right here.",
        cta: "Shop now",
        footerText: "Powered by Confirmly",
        screen: "SHOP",
        data: shop.data,
      });
      logger.info("whatsapp order Flow launched (store)", {
        waId,
        merchantId: store.merchantId,
      });
      return true;
    }

    const { token } = await createFlowSession({ waId });
    await sendFlow(waId, {
      flowId: settings.WHATSAPP_ORDER_FLOW_ID,
      flowToken: token,
      headerImageUrl: orderBannerUrl(),
      bodyText:
        "🛍️ *Shop on WhatsApp*\n\nOrder from local stores without leaving the chat. " +
        "Search for a shop or browse the marketplace, pick your items, and pay — all in one place.",
      cta: "Shop now",
      footerText: "Powered by Confirmly",
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
