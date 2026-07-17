import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { calculateOrderTotal, formatNaira } from "@/lib/money";
import { generateOrderReference } from "@/lib/references";
import { extractOrderIntent } from "@/lib/ai/nvidia";
import type { OrderIntent } from "@/lib/ai/schema";
import type { ParsedInboundMessage } from "@/lib/whatsapp/types";
import {
  matchAgainst,
  normalizeColour,
  normalizeSize,
} from "@/lib/orders/matching";
import { parseDraft, EMPTY_DRAFT, type Draft, type DraftItem } from "@/lib/orders/draft";
import { AUDIT, recordAudit } from "@/lib/orders/audit";
import { sendToCustomer } from "@/lib/orders/outbound";
import {
  buildOrderSummaryText,
  buildPaymentLinkText,
  HELP_TEXT,
  SCREENSHOT_POLICY_TEXT,
} from "@/lib/orders/summary";
import {
  createPaymentForOrder,
  verifyAndApplyPayment,
  sendPaidNotification,
} from "@/lib/payments/service";
import type { Conversation, Customer, Prisma } from "@prisma/client";

/**
 * Conversation engine. Deterministic commands and interactive replies are
 * handled without AI; NVIDIA NIM is only consulted for free text. All money
 * comes from the database, all payment state from Monnify.
 */

// Deterministic text commands (checked before any AI call).
const COMMAND_HUMAN = /^(human|agent|talk to seller|talk to (the )?merchant)[.!]?$/i;
const COMMAND_CANCEL = /^(cancel|cancel order)[.!]?$/i;
const COMMAND_HELP = /^(help|menu)[.!?]?$/i;
const COMMAND_CHECK_PAYMENT = /^(check payment|payment status)[.!?]?$/i;
const COMMAND_RESUME = /^(resume|start over)[.!?]?$/i;

interface EngineContext {
  merchantId: string;
  customer: Customer;
  conversation: Conversation;
}

export async function processInboundMessage(
  merchantId: string,
  message: ParsedInboundMessage
): Promise<void> {
  // 1. Upsert customer + conversation.
  const customer = await prisma.customer.upsert({
    where: { merchantId_waId: { merchantId, waId: message.from } },
    update: message.profileName ? { name: message.profileName } : {},
    create: {
      merchantId,
      waId: message.from,
      phoneNumber: message.from,
      name: message.profileName,
    },
  });
  const conversation = await prisma.conversation.upsert({
    where: {
      merchantId_customerId_channel: {
        merchantId,
        customerId: customer.id,
        channel: "whatsapp",
      },
    },
    update: { lastInboundAt: message.timestamp },
    create: {
      merchantId,
      customerId: customer.id,
      channel: "whatsapp",
      state: "NEW",
      lastInboundAt: message.timestamp,
    },
  });

  // 2. Store inbound message — unique provider id is our duplicate guard.
  try {
    await prisma.whatsAppMessage.create({
      data: {
        providerMessageId: message.providerMessageId,
        merchantId,
        customerId: customer.id,
        conversationId: conversation.id,
        direction: "INBOUND",
        type:
          message.kind === "text"
            ? "TEXT"
            : message.kind === "unsupported"
              ? "UNSUPPORTED"
              : message.kind === "button_reply"
                ? "BUTTON_REPLY"
                : "LIST_REPLY",
        textBody: message.text,
        status: "RECEIVED",
        providerTimestamp: message.timestamp,
        payload: {
          kind: message.kind,
          interactiveId: message.interactiveId,
          rawType: message.rawType,
        },
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      logger.info("duplicate inbound message ignored", {
        providerMessageId: message.providerMessageId,
      });
      return; // duplicate webhook delivery — nothing else runs twice
    }
    throw err;
  }

  await recordAudit({
    merchantId,
    conversationId: conversation.id,
    event: AUDIT.CUSTOMER_MESSAGE_RECEIVED,
    actor: "CUSTOMER",
    metadata: { kind: message.kind },
  });

  const ctx: EngineContext = { merchantId, customer, conversation };

  // 3. Human takeover: the bot stays silent while a person is handling it.
  if (conversation.automationMode === "HUMAN") {
    await setConversation(ctx, { state: "HUMAN_ACTIVE" });
    return;
  }

  try {
    if (message.kind === "button_reply" || message.kind === "list_reply") {
      await handleInteractiveReply(ctx, message.interactiveId ?? "");
      return;
    }
    if (message.kind === "unsupported") {
      await reply(
        ctx,
        "I can only read text messages for now. Please type your order — e.g. \"2 black polo shirts, large, deliver to Yaba\"."
      );
      return;
    }
    await handleText(ctx, message.text ?? "");
  } catch (err) {
    logger.error("engine failure", {
      conversationId: conversation.id,
      reason: err instanceof Error ? err.message : "unknown",
    });
    await safeReply(
      ctx,
      "Sorry, something went wrong on our side. A person will follow up shortly."
    );
    await handover(ctx, "engine error");
  }
}

// ---------------------------------------------------------------------------
// Text handling
// ---------------------------------------------------------------------------

async function handleText(ctx: EngineContext, text: string): Promise<void> {
  const trimmed = text.trim();

  // Deterministic commands first — never sent to the AI.
  if (COMMAND_HUMAN.test(trimmed)) {
    await reply(
      ctx,
      "No problem — I've asked the merchant to take over this chat. A person will reply shortly."
    );
    await handover(ctx, "customer request");
    return;
  }
  if (COMMAND_CANCEL.test(trimmed)) {
    await cancelCurrentOrder(ctx);
    return;
  }
  if (COMMAND_HELP.test(trimmed)) {
    await reply(ctx, HELP_TEXT);
    return;
  }
  if (COMMAND_CHECK_PAYMENT.test(trimmed)) {
    await checkPaymentStatus(ctx);
    return;
  }
  if (COMMAND_RESUME.test(trimmed)) {
    await setConversation(ctx, { state: "COLLECTING_ORDER", draft: EMPTY_DRAFT });
    await reply(ctx, "Fresh start! What would you like to order?");
    return;
  }

  // Free text → AI extraction (catalogue-grounded).
  const products = await activeProducts(ctx.merchantId);
  const catalogueHint = products
    .map((p) => [p.name, ...p.aliases].join(" / "))
    .join("; ");
  const { intent, source } = await extractOrderIntent(trimmed, catalogueHint);
  await recordAudit({
    merchantId: ctx.merchantId,
    conversationId: ctx.conversation.id,
    event: AUDIT.ORDER_INTENT_EXTRACTED,
    actor: "AI",
    metadata: { intent: intent.intent, items: intent.items.length, source },
  });

  switch (intent.intent) {
    case "HUMAN_HELP":
      await reply(
        ctx,
        "Of course — I've asked the merchant to take over. A person will reply shortly."
      );
      await handover(ctx, "customer request");
      return;
    case "CANCEL_ORDER":
      await cancelCurrentOrder(ctx);
      return;
    case "PAYMENT_QUESTION":
      await reply(ctx, SCREENSHOT_POLICY_TEXT);
      await checkPaymentStatus(ctx);
      return;
    case "BUSINESS_QUESTION":
      await reply(
        ctx,
        "I'm the ordering assistant, so I might not know that one! Reply \"human\" and the merchant will answer you directly. If you'd like to order something, just tell me what you need."
      );
      return;
    case "OTHER":
      await reply(
        ctx,
        `I help you order from this shop. ${HELP_TEXT}`
      );
      return;
    case "PLACE_ORDER":
    case "EDIT_ORDER":
      await applyOrderIntent(ctx, intent);
      return;
  }
}

// ---------------------------------------------------------------------------
// Draft building and matching
// ---------------------------------------------------------------------------

type ProductWithVariants = Prisma.ProductGetPayload<{
  include: { variants: true };
}>;

function activeProducts(merchantId: string): Promise<ProductWithVariants[]> {
  return prisma.product.findMany({
    where: { merchantId, active: true },
    include: { variants: true },
  });
}

async function applyOrderIntent(
  ctx: EngineContext,
  intent: OrderIntent
): Promise<void> {
  const products = await activeProducts(ctx.merchantId);
  const zones = await prisma.deliveryZone.findMany({
    where: { merchantId: ctx.merchantId, active: true },
  });
  const draft = parseDraft(ctx.conversation.draft);

  // Quantity-only edit ("make it three"): update the single draft item.
  const editItem = intent.items[0];
  if (
    intent.intent === "EDIT_ORDER" &&
    intent.items.length === 1 &&
    editItem &&
    (editItem.searchTerm === "*" || draft.items.length === 1)
  ) {
    const target = draft.items[0];
    if (target) {
      target.quantity = editItem.quantity;
      await recalcAndRespond(ctx, draft, products, zones);
      return;
    }
  }

  // Merge newly mentioned items into the draft.
  if (intent.items.length) {
    const newItems: DraftItem[] = intent.items.map((item) => ({
      searchTerm: item.searchTerm,
      quantity: item.quantity,
      size: normalizeSize(item.size),
      colour: normalizeColour(item.colour),
      status: "unmatched",
      productId: null,
      productName: null,
      variantId: null,
      variantLabel: null,
      unitPriceKobo: null,
      alternatives: [],
    }));
    draft.items = intent.intent === "EDIT_ORDER" ? newItems : [...draft.items.filter((i) => i.status === "matched"), ...newItems];
    // Starting a brand-new order replaces a stale unconfirmed draft.
    if (intent.intent === "PLACE_ORDER" && ctx.conversation.state === "NEW") {
      draft.items = newItems;
    }
  }

  if (intent.deliveryMethod) draft.deliveryMethod = intent.deliveryMethod;
  if (intent.deliveryArea) draft.deliveryArea = intent.deliveryArea;
  if (intent.deliveryAddress) draft.deliveryAddress = intent.deliveryAddress;
  if (intent.notes) draft.notes = intent.notes;

  await recalcAndRespond(ctx, draft, products, zones);
}

type Zone = { id: string; name: string; aliases: string[]; feeKobo: number };

/**
 * Re-matches every item, resolves the delivery zone, then either asks ONE
 * clarification question or sends the summary for confirmation.
 */
async function recalcAndRespond(
  ctx: EngineContext,
  draft: Draft,
  products: ProductWithVariants[],
  zones: Zone[]
): Promise<void> {
  if (!draft.items.length) {
    await setConversation(ctx, { state: "COLLECTING_ORDER", draft });
    await reply(ctx, "What would you like to order? You can just describe it.");
    return;
  }

  // Match products.
  for (const item of draft.items) {
    if (item.status === "matched" && item.productId) continue;
    const result = matchAgainst(item.searchTerm, products, (p) => [
      p.name,
      ...p.aliases,
    ]);
    if (result.status === "confident" && result.best) {
      applyProductToItem(item, result.best.item);
      await recordAudit({
        merchantId: ctx.merchantId,
        conversationId: ctx.conversation.id,
        event: AUDIT.PRODUCT_MATCHED,
        metadata: { searchTerm: item.searchTerm, product: result.best.item.name },
      });
    } else if (result.status === "ambiguous") {
      item.status = "ambiguous";
      item.alternatives = result.alternatives.map((c) => ({
        productId: c.item.id,
        name: c.item.name,
      }));
    } else {
      item.status = "unmatched";
      item.alternatives = [];
    }
  }

  // Resolve variants for matched items (size/colour must exist in catalogue).
  for (const item of draft.items) {
    if (item.status !== "matched" || !item.productId) continue;
    const product = products.find((p) => p.id === item.productId);
    if (!product) continue;
    resolveVariant(item, product);
  }

  // Match delivery zone.
  if (draft.deliveryMethod === "PICKUP") {
    const pickup = zones.find((z) => z.name.toLowerCase() === "pickup");
    draft.deliveryZoneId = pickup?.id ?? null;
    draft.deliveryZoneName = "Pickup";
    draft.deliveryFeeKobo = pickup?.feeKobo ?? 0;
  } else if (draft.deliveryArea) {
    const zoneResult = matchAgainst(draft.deliveryArea, zones, (z) => [
      z.name,
      ...z.aliases,
    ]);
    if (zoneResult.best && zoneResult.status !== "none") {
      draft.deliveryZoneId = zoneResult.best.item.id;
      draft.deliveryZoneName = zoneResult.best.item.name;
      draft.deliveryFeeKobo = zoneResult.best.item.feeKobo;
      draft.deliveryMethod = "DELIVERY";
    } else {
      draft.deliveryZoneId = null;
      draft.deliveryZoneName = null;
      draft.deliveryFeeKobo = null;
    }
  }

  await setConversation(ctx, { draft });

  // --- ONE question at a time -------------------------------------------------
  const unmatched = draft.items.find((i) => i.status === "unmatched");
  if (unmatched) {
    await askClarification(
      ctx,
      draft,
      `I couldn't find "${unmatched.searchTerm}" in the catalogue. Could you describe that item differently?`
    );
    return;
  }

  const ambiguous = draft.items.find((i) => i.status === "ambiguous");
  if (ambiguous) {
    const index = draft.items.indexOf(ambiguous);
    const alternatives = ambiguous.alternatives.slice(0, 3);
    await setConversation(ctx, { state: "NEEDS_CLARIFICATION", draft });
    await sendToCustomer({
      merchantId: ctx.merchantId,
      customer: ctx.customer,
      conversationId: ctx.conversation.id,
      kind: "list",
      text: `Did you mean one of these for "${ambiguous.searchTerm}"?`,
      listButtonLabel: "Choose item",
      rows: alternatives.map((a) => ({
        id: `pick:${index}:${a.productId}`,
        title: a.name.slice(0, 24),
      })),
    });
    await recordAudit({
      merchantId: ctx.merchantId,
      conversationId: ctx.conversation.id,
      event: AUDIT.CLARIFICATION_ASKED,
      metadata: { question: "product choice", searchTerm: ambiguous.searchTerm },
    });
    return;
  }

  const needsVariant = draft.items.find(
    (i) => i.status === "matched" && i.variantId === null && i.variantLabel === "REQUIRED"
  );
  if (needsVariant) {
    const product = products.find((p) => p.id === needsVariant.productId);
    const missing = missingVariantField(needsVariant, product);
    const options = variantOptions(product, missing, needsVariant);
    await setConversation(ctx, { state: "NEEDS_CLARIFICATION", draft });
    const index = draft.items.indexOf(needsVariant);
    await sendToCustomer({
      merchantId: ctx.merchantId,
      customer: ctx.customer,
      conversationId: ctx.conversation.id,
      kind: "list",
      text: `Which ${missing} for the ${needsVariant.productName}?`,
      listButtonLabel: `Choose ${missing}`,
      rows: options.slice(0, 10).map((o) => ({
        id: `variant:${index}:${missing}:${o}`,
        title: o,
      })),
    });
    await recordAudit({
      merchantId: ctx.merchantId,
      conversationId: ctx.conversation.id,
      event: AUDIT.CLARIFICATION_ASKED,
      metadata: { question: missing, product: needsVariant.productName },
    });
    return;
  }

  if (!draft.deliveryMethod) {
    await setConversation(ctx, { state: "NEEDS_CLARIFICATION", draft });
    await sendToCustomer({
      merchantId: ctx.merchantId,
      customer: ctx.customer,
      conversationId: ctx.conversation.id,
      kind: "buttons",
      text: "Should we deliver this, or will you pick it up?",
      buttons: [
        { id: "delivery:DELIVERY", title: "Delivery" },
        { id: "delivery:PICKUP", title: "Pickup" },
      ],
    });
    return;
  }

  if (draft.deliveryMethod === "DELIVERY" && !draft.deliveryZoneId) {
    const zoneRows = zones
      .filter((z) => z.name.toLowerCase() !== "pickup")
      .slice(0, 10)
      .map((z) => ({
        id: `zone:${z.id}`,
        title: z.name.slice(0, 24),
        description: formatNaira(z.feeKobo),
      }));
    await setConversation(ctx, { state: "NEEDS_CLARIFICATION", draft });
    await sendToCustomer({
      merchantId: ctx.merchantId,
      customer: ctx.customer,
      conversationId: ctx.conversation.id,
      kind: "list",
      text: draft.deliveryArea
        ? `I don't deliver to "${draft.deliveryArea}" yet. Which area should I use?`
        : "Which area should we deliver to?",
      listButtonLabel: "Choose area",
      rows: zoneRows,
    });
    return;
  }

  // --- Everything resolved: compute totals (server-side) and summarize --------
  const totals = calculateOrderTotal({
    items: draft.items.map((i) => ({
      unitPriceKobo: i.unitPriceKobo ?? 0,
      quantity: i.quantity,
    })),
    deliveryFeeKobo: draft.deliveryFeeKobo ?? 0,
  });

  const summaryText = buildOrderSummaryText({
    lines: draft.items.map((i, idx) => ({
      name: i.productName ?? i.searchTerm,
      variant: i.variantLabel && i.variantLabel !== "NONE" ? i.variantLabel : null,
      quantity: i.quantity,
      lineTotalKobo: totals.lineTotalsKobo[idx] ?? 0,
    })),
    deliveryLabel:
      draft.deliveryMethod === "PICKUP"
        ? "Pickup (no delivery fee)"
        : `Delivery to ${draft.deliveryZoneName}`,
    deliveryFeeKobo: totals.deliveryFeeKobo,
    totalKobo: totals.totalKobo,
  });

  await setConversation(ctx, { state: "AWAITING_CONFIRMATION", draft });
  await sendToCustomer({
    merchantId: ctx.merchantId,
    customer: ctx.customer,
    conversationId: ctx.conversation.id,
    kind: "buttons",
    text: summaryText,
    buttons: [
      { id: "confirm_order", title: "Confirm order" },
      { id: "edit_order", title: "Edit order" },
      { id: "talk_merchant", title: "Talk to merchant" },
    ],
  });
  await recordAudit({
    merchantId: ctx.merchantId,
    conversationId: ctx.conversation.id,
    event: AUDIT.ORDER_SUMMARY_SENT,
    metadata: { totalKobo: totals.totalKobo },
  });
}

function applyProductToItem(item: DraftItem, product: ProductWithVariants) {
  item.status = "matched";
  item.productId = product.id;
  item.productName = product.name;
  item.unitPriceKobo = product.priceKobo;
  item.alternatives = [];
  item.variantId = null;
  item.variantLabel = product.variants.length ? "REQUIRED" : "NONE";
}

function missingVariantField(
  item: DraftItem,
  product: ProductWithVariants | undefined
): "size" | "colour" {
  const sizes = new Set(product?.variants.map((v) => v.size).filter(Boolean));
  const colours = new Set(product?.variants.map((v) => v.colour).filter(Boolean));
  if (!item.size && sizes.size > 0) return "size";
  if (!item.colour && colours.size > 0) return "colour";
  return !item.size ? "size" : "colour";
}

function variantOptions(
  product: ProductWithVariants | undefined,
  field: "size" | "colour",
  item: DraftItem
): string[] {
  if (!product) return [];
  let variants = product.variants;
  if (field === "size" && item.colour) {
    variants = variants.filter(
      (v) => (v.colour ?? "").toLowerCase() === item.colour!.toLowerCase()
    );
  }
  if (field === "colour" && item.size) {
    variants = variants.filter(
      (v) => (v.size ?? "").toUpperCase() === item.size!.toUpperCase()
    );
  }
  const values = variants
    .map((v) => (field === "size" ? v.size : v.colour))
    .filter((v): v is string => Boolean(v));
  return [...new Set(values)];
}

/** Attempts to pin the item to a concrete variant; sets price from DB. */
function resolveVariant(item: DraftItem, product: ProductWithVariants) {
  if (!product.variants.length) {
    item.variantId = null;
    item.variantLabel = "NONE";
    item.unitPriceKobo = product.priceKobo;
    return;
  }
  const size = item.size ? normalizeSize(item.size) : null;
  const colour = item.colour ? normalizeColour(item.colour) : null;

  const candidates = product.variants.filter((v) => {
    const sizeOk =
      !size || (v.size ?? "").toUpperCase() === size.toUpperCase();
    const colourOk =
      !colour || (v.colour ?? "").toLowerCase() === colour.toLowerCase();
    return sizeOk && colourOk;
  });

  if (candidates.length === 1 && (size || colour)) {
    const v = candidates[0]!;
    item.variantId = v.id;
    item.variantLabel = [v.colour, v.size].filter(Boolean).join(" / ");
    item.unitPriceKobo = product.priceKobo + v.priceAdjustmentKobo;
    return;
  }
  if (size && colour && candidates.length === 0) {
    // Stated combination doesn't exist — needs a fresh choice.
    item.size = null;
    item.colour = null;
    item.variantId = null;
    item.variantLabel = "REQUIRED";
    item.unitPriceKobo = product.priceKobo;
    return;
  }
  item.variantId = null;
  item.variantLabel = "REQUIRED";
  item.unitPriceKobo = product.priceKobo;
}

// ---------------------------------------------------------------------------
// Interactive replies (no AI involved)
// ---------------------------------------------------------------------------

async function handleInteractiveReply(
  ctx: EngineContext,
  interactiveId: string
): Promise<void> {
  const draft = parseDraft(ctx.conversation.draft);
  const products = await activeProducts(ctx.merchantId);
  const zones = await prisma.deliveryZone.findMany({
    where: { merchantId: ctx.merchantId, active: true },
  });

  if (interactiveId === "confirm_order") {
    await confirmDraftOrder(ctx, draft);
    return;
  }
  if (interactiveId === "edit_order") {
    await setConversation(ctx, { state: "COLLECTING_ORDER" });
    await reply(
      ctx,
      "Sure — tell me what to change (e.g. \"make it three\", \"add one tote bag\", or \"deliver to Surulere instead\")."
    );
    return;
  }
  if (interactiveId === "talk_merchant") {
    await reply(
      ctx,
      "I've asked the merchant to take over this chat. A person will reply shortly."
    );
    await handover(ctx, "customer request");
    return;
  }
  if (interactiveId.startsWith("pick:")) {
    const [, indexStr, productId] = interactiveId.split(":");
    const item = draft.items[Number(indexStr)];
    const product = products.find((p) => p.id === productId);
    if (item && product) {
      applyProductToItem(item, product);
      await recalcAndRespond(ctx, draft, products, zones);
    } else {
      await reply(ctx, "That option has expired — please describe the item again.");
    }
    return;
  }
  if (interactiveId.startsWith("variant:")) {
    const [, indexStr, field, ...rest] = interactiveId.split(":");
    const value = rest.join(":");
    const item = draft.items[Number(indexStr)];
    if (item && (field === "size" || field === "colour")) {
      if (field === "size") item.size = value;
      else item.colour = value;
      await recalcAndRespond(ctx, draft, products, zones);
    } else {
      await reply(ctx, "That option has expired — please tell me again.");
    }
    return;
  }
  if (interactiveId.startsWith("delivery:")) {
    const method = interactiveId.split(":")[1];
    if (method === "DELIVERY" || method === "PICKUP") {
      draft.deliveryMethod = method;
      await recalcAndRespond(ctx, draft, products, zones);
    }
    return;
  }
  if (interactiveId.startsWith("zone:")) {
    const zoneId = interactiveId.split(":")[1];
    const zone = zones.find((z) => z.id === zoneId);
    if (zone) {
      draft.deliveryMethod = "DELIVERY";
      draft.deliveryArea = zone.name;
      draft.deliveryZoneId = zone.id;
      draft.deliveryZoneName = zone.name;
      draft.deliveryFeeKobo = zone.feeKobo;
      await recalcAndRespond(ctx, draft, products, zones);
    }
    return;
  }
  if (interactiveId.startsWith("retry_payment:")) {
    const orderId = interactiveId.split(":")[1];
    await retryPayment(ctx, orderId ?? "");
    return;
  }
  await reply(ctx, "Sorry, that button has expired. Type \"help\" to see options.");
}

// ---------------------------------------------------------------------------
// Order confirmation → payment
// ---------------------------------------------------------------------------

async function confirmDraftOrder(ctx: EngineContext, draft: Draft): Promise<void> {
  if (
    !draft.items.length ||
    draft.items.some((i) => i.status !== "matched" || !i.productId) ||
    (draft.deliveryMethod === "DELIVERY" && !draft.deliveryZoneId)
  ) {
    await reply(
      ctx,
      "This order isn't complete yet — tell me what you'd like and I'll rebuild the summary."
    );
    await setConversation(ctx, { state: "COLLECTING_ORDER" });
    return;
  }

  // Server-side re-pricing from the database at the moment of confirmation.
  const productIds = draft.items.map((i) => i.productId!) ;
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, merchantId: ctx.merchantId, active: true },
    include: { variants: true },
  });
  const zone = draft.deliveryZoneId
    ? await prisma.deliveryZone.findFirst({
        where: { id: draft.deliveryZoneId, merchantId: ctx.merchantId },
      })
    : null;

  const lines: Array<{
    productId: string;
    name: string;
    unitPriceKobo: number;
    quantity: number;
    variantLabel: string | null;
    stock: number;
  }> = [];
  for (const item of draft.items) {
    const product = products.find((p) => p.id === item.productId);
    if (!product) {
      await reply(
        ctx,
        `Sorry — "${item.productName ?? item.searchTerm}" is no longer available. Let's rebuild the order.`
      );
      await setConversation(ctx, { state: "COLLECTING_ORDER" });
      return;
    }
    const variant = item.variantId
      ? product.variants.find((v) => v.id === item.variantId)
      : null;
    lines.push({
      productId: product.id,
      name: product.name,
      unitPriceKobo: product.priceKobo + (variant?.priceAdjustmentKobo ?? 0),
      quantity: item.quantity,
      variantLabel:
        variant != null
          ? [variant.colour, variant.size].filter(Boolean).join(" / ")
          : null,
      stock: variant ? variant.stockQuantity : product.stockQuantity,
    });
  }

  const outOfStock = lines.find((l) => l.stock < l.quantity);
  if (outOfStock) {
    await reply(
      ctx,
      `Sorry — we only have ${outOfStock.stock} of ${outOfStock.name} left. The merchant will follow up with you.`
    );
    await handover(ctx, "insufficient stock");
    return;
  }

  const deliveryFeeKobo =
    draft.deliveryMethod === "PICKUP" ? (zone?.feeKobo ?? 0) : (zone?.feeKobo ?? 0);
  const totals = calculateOrderTotal({
    items: lines.map((l) => ({
      unitPriceKobo: l.unitPriceKobo,
      quantity: l.quantity,
    })),
    deliveryFeeKobo,
  });

  const order = await prisma.order.create({
    data: {
      reference: generateOrderReference(),
      merchantId: ctx.merchantId,
      customerId: ctx.customer.id,
      conversationId: ctx.conversation.id,
      state: "CONFIRMED",
      subtotalKobo: totals.subtotalKobo,
      deliveryFeeKobo: totals.deliveryFeeKobo,
      discountKobo: 0,
      totalKobo: totals.totalKobo,
      deliveryMethod: draft.deliveryMethod,
      deliveryAddress: draft.deliveryAddress,
      deliveryZone: draft.deliveryZoneName,
      notes: draft.notes,
      confirmedAt: new Date(),
      items: {
        create: lines.map((l, idx) => ({
          productId: l.productId,
          productNameSnapshot: l.name,
          unitPriceKoboSnapshot: l.unitPriceKobo,
          quantity: l.quantity,
          variantSnapshot: l.variantLabel,
          lineTotalKobo: totals.lineTotalsKobo[idx] ?? 0,
        })),
      },
    },
  });
  await recordAudit({
    merchantId: ctx.merchantId,
    orderId: order.id,
    conversationId: ctx.conversation.id,
    event: AUDIT.CUSTOMER_CONFIRMED,
    actor: "CUSTOMER",
    metadata: { totalKobo: totals.totalKobo },
  });

  // Create the Monnify payment request and send the link.
  try {
    const { payment, checkoutUrl, virtualAccount } = await createPaymentForOrder(
      order.id
    );
    let text = buildPaymentLinkText(
      order.totalKobo,
      order.reference,
      checkoutUrl ?? `${process.env.APP_URL ?? ""}/pay/${order.reference}`
    );
    const va = virtualAccount as {
      accountNumber?: string;
      bankName?: string;
      accountName?: string;
    } | null;
    if (va?.accountNumber && va.bankName) {
      text += `\n\nOr transfer directly to:\n${va.bankName}\n${va.accountNumber}\n${va.accountName ?? ""}`.trimEnd();
    }
    await sendToCustomer({
      merchantId: ctx.merchantId,
      customer: ctx.customer,
      conversationId: ctx.conversation.id,
      kind: "text",
      text,
    });
    await recordAudit({
      merchantId: ctx.merchantId,
      orderId: order.id,
      conversationId: ctx.conversation.id,
      event: AUDIT.PAYMENT_LINK_SENT,
      metadata: { invoiceReference: payment.invoiceReference },
    });
    await setConversation(ctx, { state: "PAYMENT_PENDING", draft: EMPTY_DRAFT });
  } catch (err) {
    logger.error("payment creation failed", {
      orderId: order.id,
      reason: err instanceof Error ? err.message : "unknown",
    });
    await reply(
      ctx,
      "Your order is confirmed, but I couldn't create the payment link right now. The merchant has been notified and will send it shortly."
    );
    await handover(ctx, "payment creation failed");
  }
}

async function retryPayment(ctx: EngineContext, orderId: string): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, merchantId: ctx.merchantId },
    include: { payment: true },
  });
  if (!order || order.state === "PAID" || order.state === "COMPLETED") {
    await reply(ctx, "This order doesn't need a new payment link.");
    return;
  }
  try {
    const { checkoutUrl } = await createPaymentForOrder(order.id);
    await sendToCustomer({
      merchantId: ctx.merchantId,
      customer: ctx.customer,
      conversationId: ctx.conversation.id,
      kind: "text",
      text: buildPaymentLinkText(
        order.totalKobo,
        order.reference,
        checkoutUrl ?? ""
      ),
    });
  } catch {
    await reply(
      ctx,
      "I couldn't create a fresh payment link. The merchant will follow up."
    );
    await handover(ctx, "payment retry failed");
  }
}

// ---------------------------------------------------------------------------
// Payment status, cancellation, handover
// ---------------------------------------------------------------------------

async function checkPaymentStatus(ctx: EngineContext): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { merchantId: ctx.merchantId, customerId: ctx.customer.id },
    orderBy: { createdAt: "desc" },
    include: { payment: true, receipt: true },
  });
  if (!order || !order.payment) {
    await reply(ctx, "I don't see any recent order with a payment yet. Would you like to place one?");
    return;
  }
  if (order.payment.state === "PAID" && order.receipt) {
    const { receiptUrl } = await import("@/lib/receipts");
    await reply(
      ctx,
      `Order ${order.reference} is paid and confirmed. ✅\nYour receipt: ${receiptUrl(order.receipt.token)}`
    );
    return;
  }

  // Verify with Monnify right now — never trust claims.
  if (order.payment.provider === "MONNIFY") {
    try {
      const result = await verifyAndApplyPayment(order.payment.id);
      if (result.transitionedToPaid) {
        await sendPaidNotification(result);
        return;
      }
      if (result.paymentState === "PAID") return; // already handled
      const friendly: Record<string, string> = {
        PENDING: `I checked with Monnify just now — payment for ${order.reference} hasn't arrived yet. Bank transfers can take a few minutes; I'll confirm automatically the moment it lands.`,
        PARTIALLY_PAID: `Monnify shows a partial payment for ${order.reference}. The merchant will review it and follow up with you.`,
        OVERPAID: `Monnify shows an overpayment for ${order.reference}. The merchant will review it and follow up with you.`,
        FAILED: `The last payment attempt for ${order.reference} failed. Reply "retry" or tap the button below for a fresh payment link.`,
        EXPIRED: `The payment link for ${order.reference} expired. I can send a fresh one.`,
        REVERSED: `The payment for ${order.reference} was reversed. The merchant will follow up.`,
      };
      const message =
        friendly[result.paymentState] ??
        `Payment status for ${order.reference}: ${result.paymentState}.`;
      if (result.paymentState === "FAILED" || result.paymentState === "EXPIRED") {
        await sendToCustomer({
          merchantId: ctx.merchantId,
          customer: ctx.customer,
          conversationId: ctx.conversation.id,
          kind: "buttons",
          text: message,
          buttons: [{ id: `retry_payment:${order.id}`, title: "New payment link" }],
        });
      } else {
        await reply(ctx, message);
      }
      if (
        result.paymentState === "PARTIALLY_PAID" ||
        result.paymentState === "OVERPAID"
      ) {
        await handover(ctx, "payment discrepancy");
      }
    } catch (err) {
      logger.warn("live verification failed during status check", {
        reason: err instanceof Error ? err.message : "unknown",
      });
      await reply(
        ctx,
        `I couldn't reach the payment provider just now. Your order ${order.reference} is still marked ${order.payment.state}. I'll keep checking automatically.`
      );
    }
    return;
  }
  await reply(ctx, `Order ${order.reference} payment status: ${order.payment.state}.`);
}

async function cancelCurrentOrder(ctx: EngineContext): Promise<void> {
  const order = await prisma.order.findFirst({
    where: {
      merchantId: ctx.merchantId,
      customerId: ctx.customer.id,
      state: { in: ["DRAFT", "CONFIRMED", "PAYMENT_PENDING"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (order) {
    await prisma.order.update({
      where: { id: order.id },
      data: { state: "CANCELLED" },
    });
    await prisma.payment.updateMany({
      where: { orderId: order.id, state: { in: ["CREATED", "PENDING"] } },
      data: { state: "FAILED" },
    });
    await recordAudit({
      merchantId: ctx.merchantId,
      orderId: order.id,
      conversationId: ctx.conversation.id,
      event: AUDIT.ORDER_CANCELLED,
      actor: "CUSTOMER",
    });
  }
  await setConversation(ctx, { state: "CANCELLED", draft: EMPTY_DRAFT });
  await reply(
    ctx,
    order
      ? `Order ${order.reference} is cancelled. If you change your mind, just send a new order.`
      : "Nothing to cancel — your draft is cleared. Send a new order anytime."
  );
}

async function handover(ctx: EngineContext, reason: string): Promise<void> {
  await prisma.conversation.update({
    where: { id: ctx.conversation.id },
    data: { automationMode: "HUMAN", state: "HUMAN_REQUIRED" },
  });
  await recordAudit({
    merchantId: ctx.merchantId,
    conversationId: ctx.conversation.id,
    event: AUDIT.HUMAN_TAKEOVER,
    metadata: { reason },
  });
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

async function setConversation(
  ctx: EngineContext,
  data: {
    state?: Conversation["state"];
    draft?: Draft;
    pendingQuestion?: string | null;
  }
): Promise<void> {
  const updated = await prisma.conversation.update({
    where: { id: ctx.conversation.id },
    data: {
      ...(data.state ? { state: data.state } : {}),
      ...(data.draft !== undefined
        ? { draft: data.draft as unknown as Prisma.InputJsonValue }
        : {}),
      ...(data.pendingQuestion !== undefined
        ? { pendingQuestion: data.pendingQuestion }
        : {}),
    },
  });
  ctx.conversation = updated;
}

async function reply(ctx: EngineContext, text: string): Promise<void> {
  await sendToCustomer({
    merchantId: ctx.merchantId,
    customer: ctx.customer,
    conversationId: ctx.conversation.id,
    kind: "text",
    text,
  });
}

async function safeReply(ctx: EngineContext, text: string): Promise<void> {
  try {
    await reply(ctx, text);
  } catch {
    /* last-resort path — never throw from the error handler */
  }
}

async function askClarification(
  ctx: EngineContext,
  draft: Draft,
  question: string
): Promise<void> {
  await setConversation(ctx, {
    state: "NEEDS_CLARIFICATION",
    draft,
    pendingQuestion: question,
  });
  await reply(ctx, question);
  await recordAudit({
    merchantId: ctx.merchantId,
    conversationId: ctx.conversation.id,
    event: AUDIT.CLARIFICATION_ASKED,
    metadata: { question },
  });
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}
