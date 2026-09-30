import "server-only";
import { env, appUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { isDistancePricingEnabled, recentPin } from "@/lib/orders/distance-delivery";
import { sendFlow, sendLocationRequest } from "@/lib/whatsapp/client";
import { createFlowSession } from "@/lib/whatsapp/flow-session";

/** Public banner shown as the Flow launch card header (see public/whatsapp/). */
function orderBannerUrl(): string {
  return `${appUrl().replace(/\/$/, "")}/whatsapp/order-banner.jpg`;
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

  // Launch with `data_exchange`: Meta ACCEPTS this send (a `navigate` launch to
  // START — or any screen — is rejected with 131009), then opens the flow and
  // calls our endpoint with an INIT request. The endpoint answers INIT with the
  // store-list screen (see resolveFlowScreen), and the flow advances from there.
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
      flowAction: "data_exchange",
    });
    logger.info("whatsapp order Flow launched", { waId, store: Boolean(store) });
    if (store) await maybeAskForLocation(waId, store.merchantId);
    return true;
  } catch (error) {
    logger.warn("whatsapp order Flow send failed; using interactive fallback", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}

/**
 * The order form can't request a location pin itself, so when the store
 * prices delivery by distance and we have no recent pin for this customer,
 * offer WhatsApp's "Send location" button next to the form. A pin shared
 * before checkout appears in the form's delivery options. Best-effort only.
 */
async function maybeAskForLocation(waId: string, merchantId: string): Promise<void> {
  try {
    const [pricing, customer] = await Promise.all([
      prisma.merchant.findUnique({
        where: { id: merchantId },
        select: {
          storeLatitude: true,
          storeLongitude: true,
          deliveryBaseFeeKobo: true,
          deliveryPerKmKobo: true,
          deliveryMaxKm: true,
        },
      }),
      prisma.customer.findUnique({
        where: { merchantId_waId: { merchantId, waId } },
        select: { lastLatitude: true, lastLongitude: true, lastLocationAt: true },
      }),
    ]);
    if (!pricing || !isDistancePricingEnabled(pricing) || recentPin(customer)) return;
    await sendLocationRequest(
      waId,
      "📍 Getting it delivered? Tap *Send location* before you check out, and the order form will offer delivery priced to your exact spot."
    );
  } catch (error) {
    logger.warn("location request send failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}
