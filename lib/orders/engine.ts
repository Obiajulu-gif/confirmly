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
  CheckoutBlockedError,
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
const COMMAND_VIEW_CART = /^(cart|view cart|view order|my cart|show cart|basket)[.!?]?$/i;
const COMMAND_MY_ORDERS = /^(my orders|order history|my order|past orders|previous orders)[.!?]?$/i;
// Store selection (one shared WhatsApp number serves every merchant).
const COMMAND_STORE = /^(?:start|store)\s+([a-z0-9-]{2,24})[.!]?$/i;
const COMMAND_STORE_LIST = /^(stores|shops|switch|change (store|shop))[.!?]?$/i;

interface EngineContext {
  merchantId: string;
  customer: Customer;
  conversation: Conversation;
}

/**
 * Entry point for every inbound WhatsApp message. Resolves which merchant the
 * customer is talking to (via their WaSession and START/STORE commands) and
 * only then enters the merchant-scoped conversation flow — catalogues are
 * never mixed across stores.
 */
export async function processInboundMessage(
  message: ParsedInboundMessage
): Promise<void> {
  const session = await prisma.waSession.upsert({
    where: { waId: message.from },
    update: message.profileName ? { profileName: message.profileName } : {},
    create: { waId: message.from, profileName: message.profileName },
  });

  const text = message.text?.trim() ?? "";

  // Deterministic store selection — before anything merchant-scoped.
  const storeMatch = text.match(COMMAND_STORE);
  const storeInteractiveId = message.interactiveId?.startsWith("store:")
    ? message.interactiveId.slice("store:".length)
    : null;
  if (storeMatch?.[1] || storeInteractiveId) {
    const merchant = storeInteractiveId
      ? await prisma.merchant.findFirst({
          where: { id: storeInteractiveId, active: true },
        })
      : await prisma.merchant.findFirst({
          where: {
            storeCode: storeMatch![1]!.replace(/-/g, "").toUpperCase(),
            active: true,
          },
        });
    if (!merchant) {
      await sendUnscoped(message.from, {
        kind: "text",
        text: "That store code doesn't match any shop here. Reply \"stores\" to see every store and its code.",
      });
      await sendStoreList(message.from);
      return;
    }
    await selectStore(session.id, merchant.id, message);
    return;
  }

  if (COMMAND_STORE_LIST.test(text)) {
    await sendStoreList(message.from);
    return;
  }

  // No active store yet: the customer must choose before ordering.
  const activeMerchant = session.activeMerchantId
    ? await prisma.merchant.findFirst({
        where: { id: session.activeMerchantId, active: true },
      })
    : null;
  if (!activeMerchant) {
    if (session.activeMerchantId) {
      await prisma.waSession.update({
        where: { id: session.id },
        data: { activeMerchantId: null },
      });
    }
    await sendUnscoped(message.from, {
      kind: "text",
      text: "Welcome to Confirmly. Pick a store to shop from — reply with its code (e.g. START ADASTYLES) or choose below.",
    });
    await sendStoreList(message.from);
    return;
  }

  await processScopedMessage(activeMerchant.id, message);
}

/** Sets the active store and greets the customer inside that store. */
async function selectStore(
  sessionId: string,
  merchantId: string,
  message: ParsedInboundMessage
): Promise<void> {
  await prisma.waSession.update({
    where: { id: sessionId },
    data: { activeMerchantId: merchantId },
  });
  const merchant = await prisma.merchant.findUniqueOrThrow({
    where: { id: merchantId },
  });
  const customer = await upsertCustomer(merchantId, message);
  let conversation = await upsertConversation(merchantId, customer.id, message);
  // A fresh store selection always resumes automation — a customer picking a
  // shop is self-serving, never mid-handover.
  if (
    conversation.automationMode === "HUMAN" ||
    conversation.pendingQuestion
  ) {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { automationMode: "AUTO", pendingQuestion: null },
    });
  }
  await storeInboundMessage(merchantId, customer.id, conversation.id, message).catch(
    () => {}
  );
  await recordAudit({
    merchantId,
    conversationId: conversation.id,
    event: "Store selected",
    actor: "CUSTOMER",
    metadata: { storeCode: merchant.storeCode },
  });
  const products = await prisma.product.findMany({
    where: { merchantId, active: true },
    orderBy: { name: "asc" },
    take: 4,
  });
  const teaser = products.length
    ? `Popular items: ${products.map((p) => p.name).join(", ")}.`
    : "";
  await sendToCustomer({
    merchantId,
    customer,
    conversationId: conversation.id,
    kind: "text",
    text: `You're now shopping with *${merchant.name}*. ${teaser}\n\nReply "stores" anytime to switch shops, or "help" for options.`,
  });

  // Conversational onboarding: collect whatever the profile is missing,
  // one question at a time, right here in the chat.
  await startChatOnboarding(
    { merchantId, customer, conversation },
    { includeGreeting: false }
  );
}

/**
 * Asks for the next missing profile detail (name, then default delivery
 * area). When nothing is missing, invites the customer to order.
 */
async function startChatOnboarding(
  ctx: EngineContext,
  opts: { includeGreeting: boolean }
): Promise<void> {
  if (!ctx.customer.name) {
    await setConversation(ctx, { pendingQuestion: "onboard:name" });
    await reply(
      ctx,
      `${opts.includeGreeting ? "Welcome! " : ""}Before we start — what's your name?`
    );
    return;
  }
  if (!ctx.customer.defaultAddress) {
    const zones = await prisma.deliveryZone.findMany({
      where: { merchantId: ctx.merchantId, active: true },
    });
    const deliveryZones = zones.filter(
      (z) => z.name.toLowerCase() !== "pickup"
    );
    if (deliveryZones.length) {
      await setConversation(ctx, { pendingQuestion: "onboard:zone" });
      await sendToCustomer({
        merchantId: ctx.merchantId,
        customer: ctx.customer,
        conversationId: ctx.conversation.id,
        kind: "list",
        text: `Nice to meet you, ${firstName(ctx.customer.name)}! Where should deliveries usually go? (You can change this on any order.)`,
        listButtonLabel: "Choose area",
        rows: [
          ...deliveryZones.slice(0, 9).map((z) => ({
            id: `onboardzone:${z.id}`,
            title: z.name.slice(0, 24),
            description: formatNaira(z.feeKobo),
          })),
          { id: "onboardzone:skip", title: "Skip for now" },
        ],
      });
      return;
    }
  }
  await setConversation(ctx, { pendingQuestion: null });
  await reply(
    ctx,
    `You're all set, ${firstName(ctx.customer.name ?? "friend")}! Just tell me what you'd like to order — in plain words.`
  );
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** True when a free-text message plausibly answers "what's your name?". */
function looksLikeName(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 40) return false;
  if (/\d/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  if (words.length > 5) return false;
  return /^[\p{L}][\p{L}\s.'-]*$/u.test(trimmed);
}

/** Interactive list of active stores (sent before any store is selected). */
async function sendStoreList(waId: string): Promise<void> {
  const merchants = await prisma.merchant.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  if (!merchants.length) {
    await sendUnscoped(waId, {
      kind: "text",
      text: "No stores are live yet — please check back soon.",
    });
    return;
  }
  await sendUnscoped(waId, {
    kind: "list",
    text: "Which store would you like to shop from?",
    listButtonLabel: "Choose store",
    rows: merchants.map((m) => ({
      id: `store:${m.id}`,
      title: m.name.slice(0, 24),
      description: `Code: ${m.storeCode}`,
    })),
  });
}

/**
 * Outbound send before a store is selected (no merchant to attribute the
 * message to — it is not persisted as a WhatsAppMessage, only delivered).
 */
async function sendUnscoped(
  waId: string,
  input: {
    kind: "text" | "list";
    text: string;
    listButtonLabel?: string;
    rows?: Array<{ id: string; title: string; description?: string }>;
  }
): Promise<void> {
  const { isDemoMode } = await import("@/lib/env");
  if (isDemoMode()) {
    logger.info("demo mode: unscoped outbound suppressed", { kind: input.kind });
    return;
  }
  try {
    const client = await import("@/lib/whatsapp/client");
    if (input.kind === "list" && input.rows?.length) {
      await client.sendList(
        waId,
        input.text,
        input.listButtonLabel ?? "Choose",
        input.rows
      );
    } else {
      await client.sendText(waId, input.text);
    }
  } catch (err) {
    logger.warn("unscoped outbound failed", {
      reason: err instanceof Error ? err.message : "unknown",
    });
  }
}

async function upsertCustomer(
  merchantId: string,
  message: ParsedInboundMessage
): Promise<Customer> {
  let customer = await prisma.customer.upsert({
    where: { merchantId_waId: { merchantId, waId: message.from } },
    update: {},
    create: {
      merchantId,
      waId: message.from,
      phoneNumber: message.from,
      name: message.profileName,
    },
  });
  if (!customer.name && message.profileName) {
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: { name: message.profileName },
    });
  }
  return customer;
}

async function upsertConversation(
  merchantId: string,
  customerId: string,
  message: ParsedInboundMessage
): Promise<Conversation> {
  return prisma.conversation.upsert({
    where: {
      merchantId_customerId_channel: {
        merchantId,
        customerId,
        channel: "whatsapp",
      },
    },
    update: { lastInboundAt: message.timestamp },
    create: {
      merchantId,
      customerId,
      channel: "whatsapp",
      state: "NEW",
      lastInboundAt: message.timestamp,
    },
  });
}

async function storeInboundMessage(
  merchantId: string,
  customerId: string,
  conversationId: string,
  message: ParsedInboundMessage
): Promise<void> {
  await prisma.whatsAppMessage.create({
    data: {
      providerMessageId: message.providerMessageId,
      merchantId,
      customerId,
      conversationId,
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
}

async function processScopedMessage(
  merchantId: string,
  message: ParsedInboundMessage
): Promise<void> {
  // 1. Upsert customer + conversation. A name captured during onboarding is
  //    authoritative — the WhatsApp profile name only fills a blank.
  const customer = await upsertCustomer(merchantId, message);
  const conversation = await upsertConversation(merchantId, customer.id, message);

  // 2. Store inbound message — unique provider id is our duplicate guard.
  try {
    await storeInboundMessage(merchantId, customer.id, conversation.id, message);
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

  // 3. Human takeover: the bot stays silent while a person is handling it —
  //    BUT a customer who is actively self-serving (tapping catalogue/flow
  //    actions or explicitly asking the bot back) automatically resumes
  //    automation, so a handover can never become a permanent dead-end.
  if (conversation.automationMode === "HUMAN") {
    const wantsBotBack =
      message.rawType.startsWith("interactive.") ||
      /^(resume|bot|menu|start over|restart|automate|shop|order)[.!?]*$/i.test(
        message.text?.trim() ?? ""
      );
    if (wantsBotBack) {
      const resumed = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          automationMode: "AUTO",
          state: "COLLECTING_ORDER",
          pendingQuestion: null,
        },
      });
      ctx.conversation = resumed;
      await recordAudit({
        merchantId,
        conversationId: conversation.id,
        event: AUDIT.AUTOMATION_RESUMED,
        actor: "CUSTOMER",
        metadata: { reason: "customer self-serve" },
      });
    } else {
      await setConversation(ctx, { state: "HUMAN_ACTIVE" });
      return;
    }
  }

  try {
    if (message.kind === "button_reply" || message.kind === "list_reply") {
      await handleInteractiveReply(ctx, message.interactiveId ?? "");
      return;
    }
    if (message.kind === "unsupported") {
      await handleUnsupportedMedia(ctx, message.rawType);
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
  if (COMMAND_VIEW_CART.test(trimmed)) {
    await showCart(ctx);
    return;
  }
  if (COMMAND_MY_ORDERS.test(trimmed)) {
    await listCustomerOrders(ctx);
    return;
  }
  if (COMMAND_RESUME.test(trimmed)) {
    await setConversation(ctx, { state: "COLLECTING_ORDER", draft: EMPTY_DRAFT });
    await reply(ctx, "Fresh start! What would you like to order?");
    return;
  }

  // In-chat onboarding answers (asked right after store selection).
  if (ctx.conversation.pendingQuestion === "onboard:name") {
    if (looksLikeName(trimmed)) {
      const updated = await prisma.customer.update({
        where: { id: ctx.customer.id },
        data: { name: trimmed.slice(0, 80) },
      });
      ctx.customer = updated;
      await recordAudit({
        merchantId: ctx.merchantId,
        conversationId: ctx.conversation.id,
        event: "Customer onboarded",
        actor: "CUSTOMER",
        metadata: { via: "whatsapp", field: "name" },
      });
      await startChatOnboarding(ctx, { includeGreeting: false });
      return;
    }
    // Not a name — stop asking and treat it as a normal message.
    await setConversation(ctx, { pendingQuestion: null });
  } else if (ctx.conversation.pendingQuestion === "onboard:zone") {
    const zones = await prisma.deliveryZone.findMany({
      where: { merchantId: ctx.merchantId, active: true },
    });
    const match = matchAgainst(trimmed, zones, (z) => [z.name, ...z.aliases]);
    if (match.best && match.status !== "none") {
      await saveDefaultZone(ctx, match.best.item.name);
      return;
    }
    // Anything else (e.g. they started ordering) falls through normally.
    await setConversation(ctx, { pendingQuestion: null });
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
    case "SELECT_MERCHANT": {
      const code = intent.merchantCode?.replace(/-/g, "").toUpperCase();
      const target = code
        ? await prisma.merchant.findFirst({
            where: { storeCode: code, active: true },
          })
        : null;
      if (!target) {
        await reply(
          ctx,
          'To switch shops, send the store code (e.g. "START ADASTYLES") or reply "stores" to see every shop.'
        );
        return;
      }
      await prisma.waSession.update({
        where: { waId: ctx.customer.waId },
        data: { activeMerchantId: target.id },
      });
      await reply(
        ctx,
        `You're now shopping with *${target.name}*. Just tell me what you'd like.`
      );
      return;
    }
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
      await answerBusinessQuestion(ctx, intent, trimmed);
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

/**
 * Answers a catalogue-answerable question (price, sizes/colours, stock,
 * delivery fees) directly from the database before ever falling back to a
 * human. Only genuinely unknowable questions hand over.
 */
async function answerBusinessQuestion(
  ctx: EngineContext,
  intent: OrderIntent,
  rawText: string
): Promise<void> {
  const lower = rawText.toLowerCase();
  const asksDelivery =
    /\b(deliver|delivery|shipping|ship|how much to|fee|drop off|dropoff)\b/.test(
      lower
    );
  const asksPrice = /\b(price|cost|how much|how many naira|amount|charge)\b/.test(
    lower
  );
  const asksVariants =
    /\b(size|sizes|colour|colours|color|colors|variant|variants|available in|options)\b/.test(
      lower
    );
  const asksStock = /\b(in stock|stock|available|availability|do you have|have any|left)\b/.test(
    lower
  );

  // Delivery-fee questions are answered from the merchant's zones. Delivery
  // keywords win even when "how much" (a price signal) is also present, since
  // "how much is delivery to Yaba" is unambiguously a delivery question.
  if (asksDelivery) {
    const zones = await prisma.deliveryZone.findMany({
      where: { merchantId: ctx.merchantId, active: true },
      orderBy: { feeKobo: "asc" },
    });
    const deliveryZones = zones.filter(
      (z) => z.name.toLowerCase() !== "pickup"
    );
    if (!deliveryZones.length) {
      await reply(
        ctx,
        "This shop hasn't set up delivery areas yet. Reply \"human\" and the merchant will help you directly."
      );
      return;
    }
    // If they named an area, answer with that specific fee.
    const named = intent.deliveryArea ?? rawText;
    const match = matchAgainst(named, deliveryZones, (z) => [z.name, ...z.aliases]);
    if (match.best && match.status !== "none") {
      await reply(
        ctx,
        `Delivery to *${match.best.item.name}* is ${formatNaira(match.best.item.feeKobo)}. Want to order? Just tell me what you'd like.`
      );
      return;
    }
    const lines = deliveryZones
      .slice(0, 8)
      .map((z) => `• ${z.name}: ${formatNaira(z.feeKobo)}`)
      .join("\n");
    await reply(
      ctx,
      `Here are our delivery areas and fees:\n${lines}\n\nTell me what you'd like to order and where, and I'll add it up.`
    );
    return;
  }

  // Otherwise, try to answer about a specific product.
  const products = await activeProducts(ctx.merchantId);
  const term = intent.items[0]?.searchTerm ?? rawText;
  const match = matchAgainst(term, products, (p) => [p.name, ...p.aliases]);
  const product =
    match.best && match.status !== "none" ? match.best.item : null;

  if (!product) {
    // Couldn't tie it to a product — offer to browse, then a human.
    await sendToCustomer({
      merchantId: ctx.merchantId,
      customer: ctx.customer,
      conversationId: ctx.conversation.id,
      kind: "buttons",
      text: "I can help with prices, sizes, colours, stock and delivery fees for this shop. Browse the catalogue, or I can call the merchant for anything else.",
      buttons: [
        { id: "commerce:menu", title: "Browse catalogue" },
        { id: "talk_merchant", title: "Ask the merchant" },
      ],
    });
    return;
  }

  const colours = [
    ...new Set(product.variants.map((v) => v.colour).filter(Boolean)),
  ] as string[];
  const sizes = [
    ...new Set(product.variants.map((v) => v.size).filter(Boolean)),
  ] as string[];
  const inStock = product.variants.length
    ? product.variants.reduce((s, v) => s + v.stockQuantity, 0)
    : product.stockQuantity;

  const parts: string[] = [`*${product.name}* — ${formatNaira(product.priceKobo)}`];
  if (asksVariants || (!asksPrice && !asksStock)) {
    if (colours.length) parts.push(`Colours: ${colours.join(", ")}`);
    if (sizes.length) parts.push(`Sizes: ${sizes.join(", ")}`);
  }
  if (asksStock || (!asksPrice && !asksVariants)) {
    parts.push(inStock > 0 ? `In stock: ${inStock}` : "Currently out of stock");
  }
  parts.push("");
  parts.push(
    inStock > 0
      ? `Want it? Just say e.g. "1 ${product.name}".`
      : "Reply \"human\" if you'd like the merchant to restock or help."
  );
  await reply(ctx, parts.join("\n"));
}

/** Read-only view of the current draft; resurfaces the next step or summary. */
async function showCart(ctx: EngineContext): Promise<void> {
  const draft = parseDraft(ctx.conversation.draft);
  if (!draft.items.length) {
    await reply(
      ctx,
      "🛒 Your order is empty right now. Just tell me what you'd like — e.g. \"2 black polo shirts, large\"."
    );
    return;
  }
  const products = await activeProducts(ctx.merchantId);
  const zones = await prisma.deliveryZone.findMany({
    where: { merchantId: ctx.merchantId, active: true },
  });
  // recalcAndRespond re-presents exactly where we are: the next question when
  // something is missing, or the full summary with confirm buttons when ready.
  await recalcAndRespond(ctx, draft, products, zones);
}

/** Friendly, media-aware redirect for photos, voice notes and documents. */
async function handleUnsupportedMedia(
  ctx: EngineContext,
  rawType: string
): Promise<void> {
  const kind = rawType.toLowerCase();
  const message =
    kind === "image" || kind === "sticker"
      ? "I can't view photos yet — but tell me the item's name and I'll find it, or tap Browse to see the catalogue with pictures."
      : kind === "audio" || kind === "voice"
        ? "I can't listen to voice notes yet — please type your order in a few words, e.g. \"2 black polo shirts, large\"."
        : kind === "video"
          ? "I can't watch videos yet — just type what you'd like to order, or tap Browse to see the catalogue."
          : kind === "document"
            ? "I can't open documents here — type your order in plain words, or tap Browse to see the catalogue."
            : "I can only read text for now — type your order in a few words, or tap Browse to see the catalogue.";
  await sendToCustomer({
    merchantId: ctx.merchantId,
    customer: ctx.customer,
    conversationId: ctx.conversation.id,
    kind: "buttons",
    text: message,
    buttons: [
      { id: "commerce:menu", title: "Browse catalogue" },
      { id: "talk_merchant", title: "Talk to merchant" },
    ],
  });
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

  // A saved onboarding profile answers the delivery question before we ask:
  // if the customer's default address matches a known zone, prefill it (the
  // summary still shows it, so they can change it before confirming).
  if (
    !draft.deliveryMethod &&
    !draft.deliveryArea &&
    !draft.deliveryZoneId &&
    ctx.customer.defaultAddress
  ) {
    const profileZone = matchAgainst(ctx.customer.defaultAddress, zones, (z) => [
      z.name,
      ...z.aliases,
    ]);
    if (profileZone.best && profileZone.status !== "none") {
      draft.deliveryMethod = "DELIVERY";
      draft.deliveryArea = profileZone.best.item.name;
      if (!draft.deliveryAddress) {
        draft.deliveryAddress = ctx.customer.defaultAddress;
      }
    }
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
    const hasPickup = zones.some((z) => z.name.toLowerCase() === "pickup");
    // Leave room (10-row list cap) for a Pickup escape and a human escape so a
    // customer in an unserved area is never trapped re-guessing area names.
    const zoneRows = zones
      .filter((z) => z.name.toLowerCase() !== "pickup")
      .slice(0, hasPickup ? 8 : 9)
      .map((z) => ({
        id: `zone:${z.id}`,
        title: z.name.slice(0, 24),
        description: formatNaira(z.feeKobo),
      }));
    const escapeRows = [
      ...(hasPickup
        ? [{ id: "delivery:PICKUP", title: "Pick up instead" }]
        : []),
      { id: "talk_merchant", title: "Ask the merchant" },
    ];
    await setConversation(ctx, { state: "NEEDS_CLARIFICATION", draft });
    await sendToCustomer({
      merchantId: ctx.merchantId,
      customer: ctx.customer,
      conversationId: ctx.conversation.id,
      kind: "list",
      text: draft.deliveryArea
        ? `I don't deliver to "${draft.deliveryArea}" yet. Pick a listed area, choose pickup, or ask the merchant.`
        : "Which area should we deliver to?",
      listButtonLabel: "Choose area",
      rows: [...zoneRows, ...escapeRows].slice(0, 10),
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
    deliveryAddress: draft.deliveryAddress,
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
  if (interactiveId.startsWith("order:")) {
    await showOrderDetail(ctx, interactiveId.slice("order:".length));
    return;
  }
  if (interactiveId.startsWith("reorder:")) {
    await reorderInto(ctx, interactiveId.slice("reorder:".length));
    return;
  }
  if (interactiveId.startsWith("onboardzone:")) {
    const zoneId = interactiveId.split(":")[1];
    if (zoneId === "skip") {
      await setConversation(ctx, { pendingQuestion: null });
      await reply(
        ctx,
        "No problem — I'll ask when you order. What would you like today?"
      );
      return;
    }
    const zone = zones.find((z) => z.id === zoneId);
    if (zone) {
      await saveDefaultZone(ctx, zone.name);
    } else {
      await setConversation(ctx, { pendingQuestion: null });
      await reply(ctx, "That option expired — what would you like to order?");
    }
    return;
  }
  // Expired/unknown button: instead of dead-ending, resurface the current step
  // (re-asks the pending question or re-shows the summary) when there's a draft,
  // otherwise nudge toward browsing.
  if (draft.items.length) {
    await recalcAndRespond(ctx, draft, products, zones);
    return;
  }
  await reply(
    ctx,
    "That option has expired. Type \"menu\" to browse the catalogue, \"help\" for options, or just tell me what you'd like to order."
  );
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

  // Remember delivery details for next time — future orders skip the
  // delivery question automatically.
  if (draft.deliveryMethod === "DELIVERY" && draft.deliveryZoneName) {
    const zoneName = draft.deliveryZoneName;
    const address = draft.deliveryAddress?.trim();
    const remembered = (
      address && address.toLowerCase().includes(zoneName.toLowerCase())
        ? address
        : [address, zoneName].filter(Boolean).join(", ")
    ).slice(0, 200);
    await prisma.customer.update({
      where: { id: ctx.customer.id },
      data: { defaultAddress: remembered },
    });
  }

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
    if (err instanceof CheckoutBlockedError) {
      await reply(ctx, err.message);
      await handover(ctx, "settlement profile inactive — checkout blocked");
      return;
    }
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

/** Interactive list of the customer's recent orders (any state). */
async function listCustomerOrders(ctx: EngineContext): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { merchantId: ctx.merchantId, customerId: ctx.customer.id },
    orderBy: { createdAt: "desc" },
    take: 9,
    include: { payment: true },
  });
  if (!orders.length) {
    await reply(
      ctx,
      "You haven't placed any orders here yet. Tell me what you'd like and I'll get started!"
    );
    return;
  }
  await sendToCustomer({
    merchantId: ctx.merchantId,
    customer: ctx.customer,
    conversationId: ctx.conversation.id,
    kind: "list",
    text: "Here are your recent orders. Tap one to see details or reorder.",
    listButtonLabel: "View orders",
    rows: orders.map((order) => ({
      id: `order:${order.id}`,
      title: order.reference,
      description: `${formatNaira(order.totalKobo)} · ${order.payment?.state ?? order.state}`,
    })),
  });
}

/** Shows one order's status, receipt (if paid), and a Reorder button. */
async function showOrderDetail(
  ctx: EngineContext,
  orderId: string
): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, merchantId: ctx.merchantId, customerId: ctx.customer.id },
    include: { payment: true, receipt: true, items: true },
  });
  if (!order) {
    await reply(ctx, "I couldn't find that order. Reply \"my orders\" to see the list again.");
    return;
  }
  const lines = order.items
    .map((i) => `• ${i.quantity} × ${i.productNameSnapshot}`)
    .join("\n");
  const parts = [
    `🧾 *Order ${order.reference}*`,
    lines,
    `Total: *${formatNaira(order.totalKobo)}*`,
    `Status: ${order.payment?.state ?? order.state}`,
  ];
  if (order.payment?.state === "PAID" && order.receipt) {
    const { receiptUrl } = await import("@/lib/receipts");
    parts.push(`Receipt: ${receiptUrl(order.receipt.token)}`);
  }
  await sendToCustomer({
    merchantId: ctx.merchantId,
    customer: ctx.customer,
    conversationId: ctx.conversation.id,
    kind: "buttons",
    text: parts.filter(Boolean).join("\n"),
    buttons: order.items.length
      ? [{ id: `reorder:${order.id}`, title: "Reorder these" }]
      : [{ id: "commerce:menu", title: "Browse catalogue" }],
  });
}

/** Clones a past order's items into a fresh draft and re-prices from the DB. */
async function reorderInto(ctx: EngineContext, orderId: string): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, merchantId: ctx.merchantId, customerId: ctx.customer.id },
    include: { items: true },
  });
  if (!order || !order.items.length) {
    await reply(ctx, "I couldn't find that order to reorder. Reply \"my orders\" to try again.");
    return;
  }
  const draft: Draft = { ...EMPTY_DRAFT };
  draft.items = order.items.map((it): DraftItem => {
    // variantSnapshot is "Colour / Size" (either side optional). Assign each
    // token to size or colour via the same normalizers the matcher uses.
    let size: string | null = null;
    let colour: string | null = null;
    for (const tok of (it.variantSnapshot ?? "")
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (/^(xs|s|m|l|xl|xxl|\d+)$/i.test(tok)) size = normalizeSize(tok);
      else colour = normalizeColour(tok);
    }
    return {
      searchTerm: it.productNameSnapshot,
      quantity: it.quantity,
      size,
      colour,
      status: "unmatched",
      productId: null,
      productName: null,
      variantId: null,
      variantLabel: null,
      unitPriceKobo: null,
      alternatives: [],
    };
  });
  // Carry the previous delivery choice; the summary still lets them change it.
  if (order.deliveryMethod === "PICKUP") {
    draft.deliveryMethod = "PICKUP";
  } else if (order.deliveryZone) {
    draft.deliveryMethod = "DELIVERY";
    draft.deliveryArea = order.deliveryZone;
    draft.deliveryAddress = order.deliveryAddress;
  }

  const products = await activeProducts(ctx.merchantId);
  const zones = await prisma.deliveryZone.findMany({
    where: { merchantId: ctx.merchantId, active: true },
  });
  await setConversation(ctx, { state: "COLLECTING_ORDER", draft });
  await reply(ctx, `Rebuilding your order from ${order.reference} at today's prices…`);
  await recalcAndRespond(ctx, draft, products, zones);
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

/** Saves the customer's default delivery area from in-chat onboarding. */
async function saveDefaultZone(
  ctx: EngineContext,
  zoneName: string
): Promise<void> {
  const updated = await prisma.customer.update({
    where: { id: ctx.customer.id },
    data: { defaultAddress: zoneName },
  });
  ctx.customer = updated;
  await setConversation(ctx, { pendingQuestion: null });
  await recordAudit({
    merchantId: ctx.merchantId,
    conversationId: ctx.conversation.id,
    event: "Customer onboarded",
    actor: "CUSTOMER",
    metadata: { via: "whatsapp", field: "deliveryArea" },
  });
  await reply(
    ctx,
    `Saved — deliveries default to *${zoneName}*. Now, what would you like to order?`
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
