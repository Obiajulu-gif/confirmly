import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { env, isDemoMode } from "@/lib/env";
import { logger } from "@/lib/logger";
import { formatNaira } from "@/lib/money";
import { scoreMatch } from "@/lib/orders/matching";
import {
  sendFlow,
  sendList,
  sendText,
  type ListRow,
} from "@/lib/whatsapp/client";
import type { ParsedInboundMessage } from "@/lib/whatsapp/types";

const DIRECTORY_COMMAND =
  /^(hi|hello|hey|shop|shops|store|stores|browse|menu|order|i want to buy|i want to order|change store|switch store)[.!?]?$/i;

export interface CommerceMenuResult {
  handled: boolean;
  forwardedMessage?: ParsedInboundMessage;
}

type StoreContext = {
  merchant: {
    id: string;
    name: string;
    category: string | null;
    storeCode: string;
  };
  customerId: string;
  conversationId: string;
};

function encodeLabel(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeLabel(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8").slice(0, 80);
  } catch {
    return null;
  }
}

async function sendStoreDirectory(waId: string): Promise<void> {
  const stores = await prisma.merchant.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    take: 10,
    select: {
      id: true,
      name: true,
      category: true,
      storeCode: true,
      description: true,
    },
  });

  if (!stores.length) {
    await sendText(waId, "No stores are live right now. Please check back soon.");
    return;
  }

  await sendList(
    waId,
    "Welcome to Confirmly. Choose a store to start shopping.",
    "Browse stores",
    stores.map((store) => ({
      id: `store:${store.id}`,
      title: store.name,
      description: `${store.category ?? "General store"} · ${store.description ?? store.storeCode}`,
    }))
  );
  logger.info("whatsapp store directory sent", { storeCount: stores.length });
}

async function upsertStoreContext(
  message: ParsedInboundMessage,
  merchantId: string
): Promise<StoreContext | null> {
  const merchant = await prisma.merchant.findFirst({
    where: { id: merchantId, active: true },
    select: { id: true, name: true, category: true, storeCode: true },
  });
  if (!merchant) return null;

  await prisma.waSession.upsert({
    where: { waId: message.from },
    update: {
      activeMerchantId: merchant.id,
      ...(message.profileName ? { profileName: message.profileName } : {}),
    },
    create: {
      waId: message.from,
      activeMerchantId: merchant.id,
      profileName: message.profileName,
    },
  });

  const customer = await prisma.customer.upsert({
    where: {
      merchantId_waId: { merchantId: merchant.id, waId: message.from },
    },
    update: message.profileName ? { name: message.profileName } : {},
    create: {
      merchantId: merchant.id,
      waId: message.from,
      phoneNumber: message.from,
      name: message.profileName,
    },
  });

  const conversation = await prisma.conversation.upsert({
    where: {
      merchantId_customerId_channel: {
        merchantId: merchant.id,
        customerId: customer.id,
        channel: "whatsapp",
      },
    },
    update: { lastInboundAt: message.timestamp },
    create: {
      merchantId: merchant.id,
      customerId: customer.id,
      channel: "whatsapp",
      state: "NEW",
      lastInboundAt: message.timestamp,
    },
  });

  await prisma.whatsAppMessage
    .create({
      data: {
        providerMessageId: message.providerMessageId,
        merchantId: merchant.id,
        customerId: customer.id,
        conversationId: conversation.id,
        direction: "INBOUND",
        type:
          message.kind === "button_reply" ? "BUTTON_REPLY" : "LIST_REPLY",
        textBody: message.text,
        payload: {
          kind: message.kind,
          interactiveId: message.interactiveId,
        },
        status: "RECEIVED",
        providerTimestamp: message.timestamp,
      },
    })
    .catch(() => undefined);

  await prisma.auditEvent.create({
    data: {
      merchantId: merchant.id,
      conversationId: conversation.id,
      event: "Store selected from WhatsApp directory",
      actor: "CUSTOMER",
      metadata: { storeCode: merchant.storeCode },
    },
  });

  return {
    merchant,
    customerId: customer.id,
    conversationId: conversation.id,
  };
}

async function contextForWaId(waId: string): Promise<StoreContext | null> {
  const session = await prisma.waSession.findUnique({ where: { waId } });
  if (!session?.activeMerchantId) return null;

  const merchant = await prisma.merchant.findFirst({
    where: { id: session.activeMerchantId, active: true },
    select: { id: true, name: true, category: true, storeCode: true },
  });
  if (!merchant) return null;

  const customer = await prisma.customer.findUnique({
    where: { merchantId_waId: { merchantId: merchant.id, waId } },
  });
  if (!customer) return null;

  const conversation = await prisma.conversation.findUnique({
    where: {
      merchantId_customerId_channel: {
        merchantId: merchant.id,
        customerId: customer.id,
        channel: "whatsapp",
      },
    },
  });
  if (!conversation) return null;

  return {
    merchant,
    customerId: customer.id,
    conversationId: conversation.id,
  };
}

async function sendCatalogue(
  waId: string,
  context: StoreContext
): Promise<void> {
  const products = await prisma.product.findMany({
    where: {
      merchantId: context.merchant.id,
      active: true,
      stockQuantity: { gt: 0 },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: { id: true, name: true, category: true },
  });

  if (!products.length) {
    await sendList(
      waId,
      `${context.merchant.name} has no available products right now.`,
      "Choose action",
      [
        { id: "commerce:change_store", title: "Change store" },
        { id: "talk_merchant", title: "Talk to merchant" },
      ]
    );
    return;
  }

  const settings = env();
  if (settings.WHATSAPP_FLOW_ENABLED && settings.WHATSAPP_ORDER_FLOW_ID) {
    try {
      await sendFlow(waId, {
        flowId: settings.WHATSAPP_ORDER_FLOW_ID,
        flowToken: randomBytes(24).toString("base64url"),
        bodyText: `Shop from ${context.merchant.name} using the guided order form.`,
        cta: "Start order",
        screen: "CATEGORY_SELECTION",
        data: {
          store_id: context.merchant.id,
          store_name: context.merchant.name,
        },
      });
      logger.info("whatsapp order Flow sent", {
        merchantId: context.merchant.id,
      });
      return;
    } catch (error) {
      logger.warn("whatsapp Flow send failed; using interactive list fallback", {
        merchantId: context.merchant.id,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  const categories = [
    ...new Set(
      products
        .map((product) => product.category?.trim())
        .filter((category): category is string => Boolean(category))
    ),
  ].sort((a, b) => a.localeCompare(b));

  const rows: ListRow[] = [
    {
      id: "commerce:all_products",
      title: "All products",
      description: `${products.length} available item${products.length === 1 ? "" : "s"}`,
    },
    ...categories.slice(0, 8).map((category) => ({
      id: `commerce:category:${encodeLabel(category)}`,
      title: category,
      description: `${products.filter((product) => product.category === category).length} products`,
    })),
    { id: "commerce:change_store", title: "Change store" },
  ];

  await sendList(
    waId,
    `You are shopping from ${context.merchant.name}. Choose a category or browse every product.`,
    "View catalogue",
    rows.slice(0, 10)
  );
  logger.info("whatsapp catalogue menu sent", {
    merchantId: context.merchant.id,
    productCount: products.length,
  });
}

async function sendProducts(
  waId: string,
  context: StoreContext,
  category: string | null
): Promise<void> {
  const products = await prisma.product.findMany({
    where: {
      merchantId: context.merchant.id,
      active: true,
      stockQuantity: { gt: 0 },
      ...(category ? { category } : {}),
    },
    orderBy: { name: "asc" },
    take: 9,
    select: {
      id: true,
      name: true,
      description: true,
      priceKobo: true,
    },
  });

  if (!products.length) {
    await sendText(
      waId,
      "No available products were found there. Send MENU to browse the catalogue again."
    );
    return;
  }

  await sendList(
    waId,
    category
      ? `Choose a product from ${category}.`
      : `Choose a product from ${context.merchant.name}.`,
    "Choose product",
    [
      ...products.map((product) => ({
        id: `commerce:product:${product.id}`,
        title: product.name,
        description: `${formatNaira(product.priceKobo)}${product.description ? ` · ${product.description}` : ""}`,
      })),
      { id: "commerce:menu", title: "Back to categories" },
    ].slice(0, 10)
  );
}

async function sendLocationOptions(
  waId: string,
  context: StoreContext,
  message: ParsedInboundMessage
): Promise<void> {
  const zones = await prisma.deliveryZone.findMany({
    where: { merchantId: context.merchant.id, active: true },
    orderBy: { feeKobo: "asc" },
  });
  const pickup = zones.find((zone) => zone.name.toLowerCase() === "pickup");
  const deliveryZones = zones.filter(
    (zone) => zone.name.toLowerCase() !== "pickup"
  );
  const hint = [message.location?.name, message.location?.address]
    .filter(Boolean)
    .join(" ")
    .trim();

  const ranked = deliveryZones
    .map((zone) => ({
      zone,
      score: hint
        ? Math.max(
            scoreMatch(hint, zone.name),
            ...zone.aliases.map((alias) => scoreMatch(hint, alias))
          )
        : 0,
    }))
    .sort((a, b) => b.score - a.score || a.zone.feeKobo - b.zone.feeKobo);
  const positive = ranked.filter((entry) => entry.score > 0).slice(0, 3);
  const suggestions = (positive.length ? positive : ranked.slice(0, 3)).map(
    (entry) => entry.zone
  );

  if (!suggestions.length && !pickup) {
    await sendText(
      waId,
      "This store has not configured delivery areas yet. Send AGENT to talk to the merchant."
    );
    return;
  }

  await sendList(
    waId,
    "Location received. Choose the closest supported option. Fees come only from the merchant's configured delivery areas.",
    "Choose area",
    [
      ...suggestions.map((zone) => ({
        id: `zone:${zone.id}`,
        title: zone.name,
        description: formatNaira(zone.feeKobo),
      })),
      ...(pickup
        ? [
            {
              id: "delivery:PICKUP",
              title: "Store pickup",
              description: formatNaira(pickup.feeKobo),
            },
          ]
        : []),
      { id: "talk_merchant", title: "Talk to merchant" },
    ].slice(0, 10)
  );
}

async function forwardProductSelection(
  message: ParsedInboundMessage,
  productId: string,
  context: StoreContext
): Promise<CommerceMenuResult> {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      merchantId: context.merchant.id,
      active: true,
      stockQuantity: { gt: 0 },
    },
    select: { name: true },
  });
  if (!product) {
    await sendText(
      message.from,
      "That product is no longer available. Send MENU to browse again."
    );
    return { handled: true };
  }

  return {
    handled: false,
    forwardedMessage: {
      ...message,
      kind: "text",
      text: `I want 1 ${product.name}`,
      interactiveId: null,
      location: null,
      flowResponse: null,
      rawType: "interactive.product_selection",
    },
  };
}

async function handleFlowReply(
  message: ParsedInboundMessage
): Promise<CommerceMenuResult> {
  const response = message.flowResponse;
  if (!response) {
    await sendText(message.from, "That order form response was incomplete. Send MENU to try again.");
    return { handled: true };
  }

  const storeId = typeof response.store_id === "string" ? response.store_id : null;
  const productId =
    typeof response.product_id === "string" ? response.product_id : null;
  const quantity = Math.max(
    1,
    Math.min(99, Number(response.quantity) || 1)
  );
  if (!storeId || !productId) {
    await sendText(message.from, "Please reopen the order form and select a store and product.");
    return { handled: true };
  }

  const context = await upsertStoreContext(message, storeId);
  if (!context) {
    await sendText(message.from, "That store is no longer available. Send STORES to choose another one.");
    return { handled: true };
  }
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      merchantId: context.merchant.id,
      active: true,
      stockQuantity: { gte: quantity },
    },
    select: { name: true },
  });
  if (!product) {
    await sendText(message.from, "That product or quantity is no longer available. Send MENU to browse again.");
    return { handled: true };
  }

  const size = typeof response.size === "string" ? response.size : "";
  const colour = typeof response.colour === "string" ? response.colour : "";
  const area =
    typeof response.delivery_area === "string" ? response.delivery_area : "";
  return {
    handled: false,
    forwardedMessage: {
      ...message,
      kind: "text",
      text: [
        `I want ${quantity} ${product.name}`,
        colour,
        size,
        area ? `deliver to ${area}` : "",
      ]
        .filter(Boolean)
        .join(", "),
      interactiveId: null,
      location: null,
      flowResponse: null,
      rawType: "interactive.flow_order",
    },
  };
}

/**
 * Handles deterministic store/category/product navigation before the AI order
 * engine. Returns a rewritten text message when a product or Flow submission
 * should continue through the existing catalogue-grounded engine.
 */
export async function preprocessCommerceMessage(
  message: ParsedInboundMessage
): Promise<CommerceMenuResult> {
  if (isDemoMode()) return { handled: false };

  if (message.kind === "flow_reply") {
    return handleFlowReply(message);
  }

  const interactiveId = message.interactiveId ?? "";
  if (
    interactiveId.startsWith("store:") ||
    interactiveId.startsWith("store_select:")
  ) {
    const merchantId = interactiveId.includes("store_select:")
      ? interactiveId.slice("store_select:".length)
      : interactiveId.slice("store:".length);
    const context = await upsertStoreContext(message, merchantId);
    if (!context) {
      await sendText(
        message.from,
        "That store is no longer available. Choose another store below."
      );
      await sendStoreDirectory(message.from);
      return { handled: true };
    }
    await sendCatalogue(message.from, context);
    return { handled: true };
  }

  if (interactiveId === "commerce:change_store") {
    await prisma.waSession.upsert({
      where: { waId: message.from },
      update: { activeMerchantId: null },
      create: { waId: message.from },
    });
    await sendStoreDirectory(message.from);
    return { handled: true };
  }

  const context = await contextForWaId(message.from);

  if (interactiveId === "commerce:menu") {
    if (context) await sendCatalogue(message.from, context);
    else await sendStoreDirectory(message.from);
    return { handled: true };
  }

  if (interactiveId === "commerce:all_products") {
    if (context) await sendProducts(message.from, context, null);
    else await sendStoreDirectory(message.from);
    return { handled: true };
  }

  if (interactiveId.startsWith("commerce:category:")) {
    if (!context) {
      await sendStoreDirectory(message.from);
      return { handled: true };
    }
    const category = decodeLabel(
      interactiveId.slice("commerce:category:".length)
    );
    if (!category) {
      await sendCatalogue(message.from, context);
      return { handled: true };
    }
    await sendProducts(message.from, context, category);
    return { handled: true };
  }

  if (interactiveId.startsWith("commerce:product:")) {
    if (!context) {
      await sendStoreDirectory(message.from);
      return { handled: true };
    }
    return forwardProductSelection(
      message,
      interactiveId.slice("commerce:product:".length),
      context
    );
  }

  if (message.kind === "location") {
    if (!context) await sendStoreDirectory(message.from);
    else await sendLocationOptions(message.from, context, message);
    return { handled: true };
  }

  const text = message.text?.trim() ?? "";
  if (DIRECTORY_COMMAND.test(text)) {
    if (context && !/^(stores|shops|store|change store|switch store)[.!?]?$/i.test(text)) {
      await sendCatalogue(message.from, context);
    } else {
      await sendStoreDirectory(message.from);
    }
    return { handled: true };
  }

  return { handled: false };
}
