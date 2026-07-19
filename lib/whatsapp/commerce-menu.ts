import "server-only";
import { randomBytes } from "node:crypto";
import { defer } from "@/lib/defer";
import { prewarmProductImages } from "@/lib/ai/product-image-prewarm";
import { prisma } from "@/lib/db";
import { env, isDemoMode } from "@/lib/env";
import { logger } from "@/lib/logger";
import { formatNaira } from "@/lib/money";
import { scoreMatch } from "@/lib/orders/matching";
import {
  sendButtons,
  sendFlow,
  sendImageByUrl,
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
    // Selecting a store from the directory is always a self-serve action, so
    // resume automation and clear any stale pending question.
    update: {
      lastInboundAt: message.timestamp,
      automationMode: "AUTO",
      pendingQuestion: null,
    },
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
  // Backfill a missing product image in the background as customers browse —
  // never blocks the WhatsApp response.
  defer(() =>
    prewarmProductImages({
      merchantId: context.merchant.id,
      limit: 1,
      autoApprove: true,
      maxAttempts: 1,
      timeoutMs: 40_000,
      steps: 1,
      maxRuntimeMs: 50_000,
    }).then(() => undefined)
  );
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

async function productForSelection(productId: string, context: StoreContext) {
  return prisma.product.findFirst({
    where: {
      id: productId,
      merchantId: context.merchant.id,
      active: true,
      stockQuantity: { gt: 0 },
    },
    include: { variants: true },
  });
}

function productDetails(product: {
  name: string;
  description: string | null;
  priceKobo: number;
  stockQuantity: number;
  variants: Array<{ colour: string | null; size: string | null }>;
}) {
  const colours = [
    ...new Set(
      product.variants
        .map((variant) => variant.colour)
        .filter((value): value is string => Boolean(value))
    ),
  ];
  const sizes = [
    ...new Set(
      product.variants
        .map((variant) => variant.size)
        .filter((value): value is string => Boolean(value))
    ),
  ];
  return {
    text: [
      `*${product.name}*`,
      formatNaira(product.priceKobo),
      [colours.join(", "), sizes.join(", ")].filter(Boolean).join(" · "),
      `${product.stockQuantity} in stock`,
      product.description ?? "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

async function previewProductSelection(
  message: ParsedInboundMessage,
  productId: string,
  context: StoreContext
): Promise<CommerceMenuResult> {
  const product = await productForSelection(productId, context);
  if (!product) {
    await sendText(
      message.from,
      "That product is no longer available. Send MENU to browse again."
    );
    return { handled: true };
  }

  const details = productDetails(product);
  const allowGenerated =
    product.imageSource !== "AI_GENERATED" ||
    Boolean(product.imageApprovedAt) ||
    env().ALLOW_UNAPPROVED_AI_PRODUCT_IMAGES;
  const disclosure =
    product.imageSource === "AI_GENERATED"
      ? "AI-generated product illustration — actual item may vary."
      : product.imageSource === "MERCHANT_UPLOAD"
        ? "Merchant-provided product photo."
        : product.imageSource === "EXTERNAL_URL"
          ? "Product image supplied by the merchant."
          : "";

  let imageSent = false;
  if (product.imageUrl && allowGenerated) {
    try {
      await sendImageByUrl(message.from, {
        imageUrl: product.imageUrl,
        caption: [details.text, disclosure].filter(Boolean).join("\n\n"),
      });
      imageSent = true;
      logger.info("product image sent on WhatsApp", {
        merchantId: context.merchant.id,
        productId: product.id,
        source: product.imageSource,
      });
    } catch (error) {
      logger.warn("product image send failed; continuing with text", {
        merchantId: context.merchant.id,
        productId: product.id,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  if (!imageSent) {
    const unavailable =
      product.imageSource === "AI_GENERATED" && !allowGenerated
        ? "The AI illustration is waiting for merchant approval."
        : "The merchant has not added a customer-ready product photo yet.";
    await sendText(message.from, `${details.text}\n\n${unavailable}`);
  }

  await sendButtons(message.from, "What would you like to do?", [
    { id: `commerce:add:${product.id}:1`, title: "Add 1 to order" },
    { id: `commerce:quantity:${product.id}`, title: "Choose quantity" },
    { id: "commerce:products_back", title: "Back to products" },
  ]);
  return { handled: true };
}

async function forwardProductQuantity(
  message: ParsedInboundMessage,
  productId: string,
  quantity: number,
  context: StoreContext
): Promise<CommerceMenuResult> {
  const product = await productForSelection(productId, context);
  if (
    !product ||
    quantity < 1 ||
    quantity > Math.min(10, product.stockQuantity)
  ) {
    await sendText(
      message.from,
      "That product or quantity is no longer available. Send MENU to browse again."
    );
    return { handled: true };
  }
  return {
    handled: false,
    forwardedMessage: {
      ...message,
      // A fresh synthetic id: the catalogue selection and the order it
      // triggers are distinct events, so the engine's duplicate guard can
      // never drop the forwarded order.
      providerMessageId: `${message.providerMessageId}:order:${productId}:${quantity}`,
      kind: "text",
      text: `I want ${quantity} ${product.name}`,
      interactiveId: null,
      location: null,
      flowResponse: null,
      rawType: "interactive.product_selection",
    },
  };
}

async function sendQuantityOptions(
  message: ParsedInboundMessage,
  productId: string,
  context: StoreContext
): Promise<void> {
  const product = await productForSelection(productId, context);
  if (!product) {
    await sendText(message.from, "That product is no longer available.");
    return;
  }
  const maximum = Math.min(9, product.stockQuantity);
  await sendList(
    message.from,
    `Choose the quantity of ${product.name}.`,
    "Choose quantity",
    [
      ...Array.from({ length: maximum }, (_, index) => ({
        id: `commerce:qty:${product.id}:${index + 1}`,
        title: `${index + 1}`,
        description: `${index + 1} × ${formatNaira(product.priceKobo)}`,
      })),
      { id: "commerce:products_back", title: "Back to products" },
    ].slice(0, 10)
  );
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

  if (interactiveId === "commerce:products_back") {
    if (context) await sendProducts(message.from, context, null);
    else await sendStoreDirectory(message.from);
    return { handled: true };
  }

  if (interactiveId.startsWith("commerce:add:")) {
    if (!context) {
      await sendStoreDirectory(message.from);
      return { handled: true };
    }
    const parts = interactiveId.split(":");
    return forwardProductQuantity(
      message,
      parts[2] ?? "",
      Number(parts[3] ?? 1),
      context
    );
  }

  if (interactiveId.startsWith("commerce:quantity:")) {
    if (!context) {
      await sendStoreDirectory(message.from);
      return { handled: true };
    }
    await sendQuantityOptions(
      message,
      interactiveId.slice("commerce:quantity:".length),
      context
    );
    return { handled: true };
  }

  if (interactiveId.startsWith("commerce:qty:")) {
    if (!context) {
      await sendStoreDirectory(message.from);
      return { handled: true };
    }
    const parts = interactiveId.split(":");
    return forwardProductQuantity(
      message,
      parts[2] ?? "",
      Number(parts[3] ?? 0),
      context
    );
  }

  if (interactiveId.startsWith("commerce:product:")) {
    if (!context) {
      await sendStoreDirectory(message.from);
      return { handled: true };
    }
    return previewProductSelection(
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
