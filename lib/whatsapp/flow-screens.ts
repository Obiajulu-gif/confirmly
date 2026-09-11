import "server-only";
import type { WhatsAppFlowSession } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { formatNaira } from "@/lib/money";
import { storeLogos } from "@/lib/store-logo";
import {
  cartSubtotalKobo,
  readFlowState,
  updateFlowSession,
  type FlowCartItem,
  type FlowOrderState,
} from "@/lib/whatsapp/flow-session";
import {
  productImageBase64,
  productThumbnails,
} from "@/lib/whatsapp/flow-media";
import { finalizeFlowOrder } from "@/lib/whatsapp/flow-order";

/**
 * Server-side resolver for the native ordering Flow. Given the decrypted
 * data-exchange request and the validated session, it computes the NEXT screen
 * entirely from PostgreSQL. Nothing the client echoes back — price, stock,
 * delivery fee, merchant id — is ever trusted: the client may only choose an id
 * from a list we previously served, and every id is re-validated against the
 * database before it advances the order.
 *
 * The cart is multi-item. WhatsApp Flows forbid backward navigation, so the
 * "add another item" loop is a SAME-SCREEN re-render of the SHOP screen (never
 * a jump back to a catalogue screen). Products with variants are expanded into
 * one selectable SKU row each, so a size/colour is chosen without a per-item
 * sub-screen.
 */

export interface FlowScreenResponse {
  screen: string;
  data: Record<string, unknown>;
}

const MAX_STORE_ROWS = 20;
/** Image-rich catalogue rows are heavier, so cap tighter than a text list. */
const MAX_PRODUCT_ROWS = 20;
const MAX_QUANTITY = 10;

type Row = { id: string; title: string; description?: string };
/** A NavigationList store card: logo + name + category, tapped to open. */
type StoreNavItem = {
  id: string;
  "main-content": { title: string; description: string; metadata: string };
  start: { image: string; "alt-text": string };
};
/** A catalogue row may carry a Base64 thumbnail + alt text. */
type ProductRow = Row & { image?: string; "alt-text"?: string };

const QUANTITY_ROWS: Row[] = Array.from({ length: MAX_QUANTITY }, (_, i) => ({
  id: String(i + 1),
  title: String(i + 1),
}));

/** Sentinel catalogue-row id that opens the cart view instead of a product. */
const CART_ROW_ID = "__cart__";

function str(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function title30(value: string): string {
  return value.slice(0, 30);
}

/**
 * A store's pickup option may be named "Pickup", "Store pickup", "Pickup
 * point", etc. — treat any zone whose name mentions pickup as pickup so we
 * don't force an address for it.
 */
function isPickupZone(name: string | null | undefined): boolean {
  return (name ?? "").toLowerCase().includes("pickup");
}

/** Error fields every data-driven screen declares, so messages are visible. */
function errorFields(error?: string): {
  has_error: boolean;
  error_message: string;
} {
  return { has_error: Boolean(error), error_message: error ?? "" };
}

/**
 * A self-contained, DB-free re-render of a screen carrying only an error.
 * WhatsApp Flows allow a data_exchange response to re-render the SAME screen or
 * move forward, never backward, so an unrecoverable state (expired session, an
 * item that just sold out) or an unexpected failure must stay on the current
 * screen. Every collection is empty and its `has_*` guard is false, so no
 * required control is served without options.
 */
export function recoveryScreen(
  screenId: string,
  message: string
): FlowScreenResponse {
  const base = errorFields(message);
  switch (screenId) {
    case "SHOP":
      return {
        screen: "SHOP",
        data: {
          store_name: "Your order",
          has_cart: false,
          cart_summary: "",
          cart_total: "",
          has_skus: false,
          skus: [],
          ...base,
        },
      };
    case "DELIVERY":
      return {
        screen: "DELIVERY",
        data: { has_zones: false, zones: [], ...base },
      };
    case "SEARCH":
    default:
      return {
        screen: "SEARCH",
        data: { store_items: [EMPTY_STORE_ITEM] },
      };
  }
}

// ---- Store list / search ---------------------------------------------------

/**
 * Stores shown in the picker are limited to those with at least one in-stock
 * product, so tapping a card always advances to a shop that has something to
 * sell (the NavigationList screen can't display an inline "no items" error).
 */
async function listEligibleStores() {
  return prisma.merchant.findMany({
    where: {
      active: true,
      products: { some: { active: true, stockQuantity: { gt: 0 } } },
    },
    orderBy: { name: "asc" },
    take: MAX_STORE_ROWS,
    select: { id: true, name: true, category: true, storeCode: true },
  });
}

/** Builds the NavigationList store cards, each with its logo (or generated tile). */
async function storeNavItems(
  stores: Array<{ id: string; name: string; category: string | null; storeCode: string }>
): Promise<StoreNavItem[]> {
  const logos = await storeLogos(stores);
  return stores.map((store) => ({
    id: store.id,
    "main-content": {
      title: title30(store.name),
      description: (store.category ?? "Store").slice(0, 20),
      metadata: store.storeCode.slice(0, 80),
    },
    start: {
      image: logos.get(store.id) ?? "",
      "alt-text": `${store.name} logo`,
    },
  }));
}

/**
 * The NavigationList needs at least one item, so an empty marketplace shows a
 * single non-store card. Tapping it just re-renders the (still empty) list.
 */
const EMPTY_STORE_ITEM: StoreNavItem = {
  id: "__none__",
  "main-content": {
    title: "No stores available",
    description: "Check back soon",
    metadata: "",
  },
  start: {
    image:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQAY3Y2wAAAAAElFTkSuQmCC",
    "alt-text": "No stores",
  },
};

async function buildSearchScreen(
  _params: { error?: string } = {}
): Promise<FlowScreenResponse> {
  const stores = await listEligibleStores();
  const items = stores.length ? await storeNavItems(stores) : [EMPTY_STORE_ITEM];
  return {
    screen: "SEARCH",
    data: { store_items: items },
  };
}

// ---- SHOP: catalogue + cart ------------------------------------------------

function loadProduct(productId: string, merchantId: string) {
  return prisma.product.findFirst({
    where: { id: productId, merchantId, active: true, stockQuantity: { gt: 0 } },
    include: { variants: true },
  });
}

function variantLabelOf(size: string | null, colour: string | null): string {
  return [size, colour].filter(Boolean).join(" / ");
}

/** One image-rich catalogue row per product (variants are picked on the
 *  product screen). `category · ₦price` reads as the row subtitle. */
async function buildProductRows(
  products: Array<{
    id: string;
    name: string;
    category: string | null;
    priceKobo: number;
  }>
): Promise<ProductRow[]> {
  const thumbs = await productThumbnails(products.map((p) => p.id));
  return products.map((product) => {
    const image = thumbs.get(product.id);
    const category = product.category ? `${product.category} · ` : "";
    return {
      id: product.id,
      title: title30(product.name),
      description: `${category}${formatNaira(product.priceKobo)}`,
      ...(image ? { image, "alt-text": product.name } : {}),
    };
  });
}

/** A cart summary line for the catalogue header ("🛒 2 items · ₦4,050"). */
function cartHint(items: FlowCartItem[]): string {
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  if (!count) return "";
  return `🛒 ${count} item${count === 1 ? "" : "s"} · ${formatNaira(
    cartSubtotalKobo(items)
  )} in your cart`;
}

/** Full SHOP data with every field defaulted; builders override per view. */
function shopDefaults(storeName: string) {
  return {
    store_name: storeName,
    footer_label: "Continue",
    show_product: false,
    show_cart: false,
    show_cart_hint: false,
    show_products: false,
    show_product_image: false,
    show_sizes: false,
    show_colours: false,
    has_error: false,
    error_message: "",
    has_cart: false,
    cart_hint: "",
    has_products: false,
    products: [] as ProductRow[],
    product_name: "",
    product_price: "",
    product_description: "",
    product_image: "",
    quantities: QUANTITY_ROWS,
    sizes: [] as Row[],
    colours: [] as Row[],
    cart_lines: "",
    cart_total: "",
  };
}

function cartLines(items: FlowCartItem[]): string {
  return items
    .map((item) => {
      const label = item.variantLabel ? ` (${item.variantLabel})` : "";
      return `${item.quantity} × ${item.name}${label} — ${formatNaira(item.lineKobo)}`;
    })
    .join("\n");
}

async function storeName(merchantId: string): Promise<string | null> {
  const merchant = await prisma.merchant.findFirst({
    where: { id: merchantId, active: true },
    select: { name: true },
  });
  return merchant?.name ?? null;
}

/**
 * SHOP — catalogue view. This is also the Flow's entry when a customer opens
 * straight into a store, so it keeps the exported name and shape callers use.
 */
export async function buildShopScreen(
  merchantId: string,
  state: FlowOrderState,
  error?: string
): Promise<FlowScreenResponse> {
  const name = await storeName(merchantId);
  if (!name) {
    return recoveryScreen(
      "SHOP",
      "That store is no longer available. Close this and start again."
    );
  }
  const products = await prisma.product.findMany({
    where: { merchantId, active: true, stockQuantity: { gt: 0 } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: MAX_PRODUCT_ROWS,
    select: { id: true, name: true, category: true, priceKobo: true },
  });
  const productRows = await buildProductRows(products);
  const items = state.items ?? [];
  // When the cart has items, offer a "View cart" row at the top so the customer
  // can open the cart view on demand (single Footer, so it's a selectable row).
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const rows: ProductRow[] = count
    ? [
        {
          id: CART_ROW_ID,
          title: `🛒 View cart · ${count} item${count === 1 ? "" : "s"}`,
          description: `${formatNaira(cartSubtotalKobo(items))} — review or check out`,
        },
        ...productRows,
      ]
    : productRows;
  return {
    screen: "SHOP",
    data: {
      ...shopDefaults(name),
      footer_label: "Continue",
      show_products: rows.length > 0,
      has_products: rows.length > 0,
      products: rows,
      show_cart_hint: items.length > 0,
      has_cart: items.length > 0,
      cart_hint: cartHint(items),
      ...errorFields(error),
    },
  };
}

/** SHOP — product ("Customize") view: image, price, quantity, size/colour. */
async function buildProductMode(
  merchantId: string,
  state: FlowOrderState,
  productId: string,
  error?: string
): Promise<FlowScreenResponse> {
  const name = await storeName(merchantId);
  const product = name ? await loadProduct(productId, merchantId) : null;
  if (!name || !product) {
    return buildShopScreen(
      merchantId,
      { ...state, shopMode: "catalogue", selectedProductId: undefined },
      "That item is no longer available. Pick another."
    );
  }
  const inStock = product.variants.filter((v) => v.stockQuantity > 0);
  const sizes = distinctOptions(inStock.map((v) => v.size));
  const colours = distinctOptions(inStock.map((v) => v.colour));
  const image = await productImageBase64(product.id, "detail");
  const hasAdjustment = inStock.some((v) => v.priceAdjustmentKobo !== 0);

  return {
    screen: "SHOP",
    data: {
      ...shopDefaults(name),
      footer_label: "Add to cart",
      show_product: true,
      show_product_image: Boolean(image),
      product_image: image ?? "",
      product_name: product.name,
      product_price: `${hasAdjustment ? "From " : ""}${formatNaira(product.priceKobo)}`,
      product_description: product.description ?? "",
      quantities: QUANTITY_ROWS,
      show_sizes: sizes.length > 0,
      sizes,
      show_colours: colours.length > 0,
      colours,
      ...errorFields(error),
    },
  };
}

/** SHOP — cart view: line items, subtotal and what-next choices. */
function buildCartMode(
  name: string,
  state: FlowOrderState,
  error?: string
): FlowScreenResponse {
  const items = state.items ?? [];
  return {
    screen: "SHOP",
    data: {
      ...shopDefaults(name),
      footer_label: "Continue",
      show_cart: true,
      cart_lines: items.length
        ? `🛒 Your cart\n${cartLines(items)}`
        : "Your cart is empty.",
      cart_total: items.length
        ? `Subtotal: ${formatNaira(cartSubtotalKobo(items))}`
        : "",
      ...errorFields(error),
    },
  };
}

/** Distinct, order-preserving non-empty option rows (sizes or colours). */
function distinctOptions(values: Array<string | null>): Row[] {
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const value of values) {
    const v = (value ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    rows.push({ id: v, title: title30(v) });
  }
  return rows;
}

// ---- Delivery --------------------------------------------------------------

async function buildDeliveryScreen(
  merchantId: string,
  error?: string
): Promise<FlowScreenResponse> {
  const zones = await prisma.deliveryZone.findMany({
    where: { merchantId, active: true },
    orderBy: { feeKobo: "asc" },
    select: { id: true, name: true, feeKobo: true },
  });
  const rows: Row[] = zones.map((zone) => ({
    id: zone.id,
    title: title30(zone.name),
    description: zone.feeKobo > 0 ? `${formatNaira(zone.feeKobo)} delivery` : "Free",
  }));
  const message =
    error ??
    (rows.length
      ? undefined
      : "This store hasn't set delivery or pickup areas yet. Please message the store to order.");
  return {
    screen: "DELIVERY",
    data: {
      has_zones: rows.length > 0,
      zones: rows,
      ...errorFields(message),
    },
  };
}

// ---- Review (terminal) -----------------------------------------------------

async function buildReviewScreen(
  state: FlowOrderState,
  flowToken: string
): Promise<FlowScreenResponse> {
  const items = state.items ?? [];
  const itemLines = cartLines(items);
  const isPickup = isPickupZone(state.deliveryZoneName);
  const deliveryLine = state.deliveryZoneName
    ? `${isPickup ? "Pickup at" : "Deliver to"} ${state.deliveryZoneName}`
    : "";
  const addressLine = !isPickup && state.address ? state.address : "";
  const summaryLines = [itemLines, deliveryLine, addressLine].filter(Boolean);
  const subtotal = cartSubtotalKobo(items);
  const breakdown = `Items ${formatNaira(subtotal)} + delivery ${formatNaira(
    state.deliveryFeeKobo ?? 0
  )}`;

  return {
    screen: "REVIEW",
    data: {
      summary: `${summaryLines.join("\n")}\n\n${breakdown}`,
      total_label: `Total: ${formatNaira(state.totalKobo ?? subtotal)}`,
      flow_token: flowToken,
    },
  };
}

/**
 * REVIEW → Confirm: place the order + create the Monnify payment, then show the
 * PAYMENT screen with a "Pay now" link right inside the Flow. The order is
 * created here (not after the Flow closes) so the payment link lives in the
 * Flow UI. On failure, re-render REVIEW with an error rather than a broken jump.
 */
async function handleReview(
  session: WhatsAppFlowSession,
  flowToken: string
): Promise<FlowScreenResponse> {
  const result = await finalizeFlowOrder(session);
  if (!result) {
    return {
      screen: "REVIEW",
      data: {
        summary:
          "Something went wrong placing your order. Please close this and start again.",
        total_label: "",
        flow_token: flowToken,
      },
    };
  }
  return {
    screen: "PAYMENT",
    data: {
      payment_summary: `Order ${result.orderRef} is confirmed.\n\nTotal due: ${formatNaira(
        result.totalKobo
      )}`,
      checkout_url: result.checkoutUrl,
    },
  };
}

// ---- Transition handlers ---------------------------------------------------

/** True when this WhatsApp user has never given us a name (first-time customer). */
async function isNewCustomer(waId: string): Promise<boolean> {
  const existing = await prisma.customer.findFirst({
    where: { waId, name: { not: null } },
    select: { id: true },
  });
  return !existing;
}

/** The first-time "Set up your account" screen (name · email · referral). */
function buildOnboardingScreen(error?: string): FlowScreenResponse {
  return { screen: "ONBOARDING", data: { ...errorFields(error) } };
}

async function handleStart(
  session: WhatsAppFlowSession,
  state: FlowOrderState,
  payload: Record<string, unknown>
): Promise<FlowScreenResponse> {
  const mode = str(payload, "entry_point") === "search" ? "search" : "marketplace";
  // First-time customers set up their profile once before shopping; returning
  // customers keep their saved details and go straight to store discovery.
  if (await isNewCustomer(session.waId)) {
    await updateFlowSession(session.id, {
      state: { ...state, entryPoint: mode },
      currentScreen: "ONBOARDING",
    });
    return buildOnboardingScreen();
  }
  await updateFlowSession(session.id, {
    state: { ...state, entryPoint: mode },
    currentScreen: "SEARCH",
  });
  return buildSearchScreen();
}

async function handleOnboarding(
  session: WhatsAppFlowSession,
  state: FlowOrderState,
  payload: Record<string, unknown>
): Promise<FlowScreenResponse> {
  const name = str(payload, "name").trim();
  const email = str(payload, "email").trim();
  const referral = str(payload, "referral").trim();
  if (name.length < 2) {
    return buildOnboardingScreen("Please enter your name.");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return buildOnboardingScreen("Please enter a valid email address.");
  }
  // Capture a global lead immediately — this records every completed onboarding
  // even if the customer never picks a store. Best-effort.
  try {
    await prisma.lead.upsert({
      where: { waId: session.waId },
      create: {
        waId: session.waId,
        name,
        email,
        referralCode: referral || null,
        source: "flow_onboarding",
      },
      update: { name, email, referralCode: referral || null },
    });
  } catch (err) {
    logger.warn("flow lead capture failed", {
      reason: err instanceof Error ? err.message : "unknown",
    });
  }
  await updateFlowSession(session.id, {
    state: {
      ...state,
      onboardingName: name,
      onboardingEmail: email,
      referralCode: referral || null,
    },
    currentScreen: "SEARCH",
  });
  return buildSearchScreen();
}

/**
 * Persists the customer for a store as soon as they select it in the Flow,
 * applying any first-time onboarding profile (name · email · referral). Runs
 * best-effort — a write failure must never block store browsing. A matching
 * Conversation is upserted so the customer also appears in the ops inbox.
 */
async function recordFlowCustomer(
  merchantId: string,
  session: WhatsAppFlowSession,
  state: FlowOrderState
): Promise<void> {
  const profile = {
    ...(state.onboardingName ? { name: state.onboardingName } : {}),
    ...(state.onboardingEmail ? { email: state.onboardingEmail } : {}),
    ...(state.referralCode ? { referralCode: state.referralCode } : {}),
  };
  try {
    const customer = await prisma.customer.upsert({
      where: { merchantId_waId: { merchantId, waId: session.waId } },
      create: { merchantId, waId: session.waId, phoneNumber: session.waId, ...profile },
      update: profile,
    });
    await prisma.conversation.upsert({
      where: {
        merchantId_customerId_channel: {
          merchantId,
          customerId: customer.id,
          channel: "whatsapp",
        },
      },
      create: {
        merchantId,
        customerId: customer.id,
        channel: "whatsapp",
        state: "COLLECTING_ORDER",
        lastInboundAt: new Date(),
      },
      update: { lastInboundAt: new Date() },
    });
  } catch (err) {
    logger.warn("flow customer record failed", {
      merchantId,
      reason: err instanceof Error ? err.message : "unknown",
    });
  }
}

async function handleSearch(
  session: WhatsAppFlowSession,
  state: FlowOrderState,
  payload: Record<string, unknown>
): Promise<FlowScreenResponse> {
  const storeId = str(payload, "store_id");

  if (storeId) {
    const merchant = await prisma.merchant.findFirst({
      where: { id: storeId, active: true },
      select: { id: true, name: true },
    });
    if (!merchant) {
      return buildSearchScreen({
        error: "That store is no longer available. Pick another.",
      });
    }
    // Confirm the store has something to sell before advancing — SEARCH can
    // re-render itself, but SHOP cannot navigate back to SEARCH.
    const productCount = await prisma.product.count({
      where: { merchantId: merchant.id, active: true, stockQuantity: { gt: 0 } },
    });
    if (productCount === 0) {
      return buildSearchScreen({
        error: `${merchant.name} has no items available right now. Try another store.`,
      });
    }
    // Record the customer for this store now (with any onboarding profile) so a
    // first-time user shows up in the backend/admin even before they order.
    await recordFlowCustomer(merchant.id, session, state);
    const nextState: FlowOrderState = {
      ...state,
      merchantId: merchant.id,
      storeName: merchant.name,
      items: [],
    };
    await updateFlowSession(session.id, {
      state: nextState,
      merchantId: merchant.id,
      currentScreen: "SHOP",
    });
    return buildShopScreen(merchant.id, nextState);
  }

  return buildSearchScreen();
}

/**
 * SHOP is a single Flow screen re-rendered in three views (catalogue → product
 * → cart), because WhatsApp Flows forbid backward navigation and the "add
 * another item" loop must stay on one screen. The current view lives in
 * `state.shopMode`; every product, variant, price and stock value is re-read
 * from PostgreSQL here — nothing the client echoes is trusted.
 */
async function handleShop(
  session: WhatsAppFlowSession,
  state: FlowOrderState,
  payload: Record<string, unknown>
): Promise<FlowScreenResponse> {
  if (!state.merchantId) {
    return recoveryScreen(
      "SHOP",
      "Your order session expired. Close this and start a new order."
    );
  }
  const merchantId = state.merchantId;
  const mode = state.shopMode ?? "catalogue";
  const name = state.storeName ?? "your store";

  // --- Catalogue: the customer picked a product to customize ---------------
  if (mode === "catalogue") {
    const productId = str(payload, "product_pick");
    // "View cart" row → open the cart view.
    if (productId === CART_ROW_ID) {
      const items = state.items ?? [];
      if (!items.length) {
        return buildShopScreen(merchantId, state, "Your cart is empty — add an item first.");
      }
      const nextState: FlowOrderState = { ...state, shopMode: "cart" };
      await updateFlowSession(session.id, { state: nextState });
      return buildCartMode(name, nextState);
    }
    if (!productId) {
      return buildShopScreen(merchantId, state, "Tap a product to view it.");
    }
    const product = await loadProduct(productId, merchantId);
    if (!product) {
      return buildShopScreen(merchantId, state, "That item just sold out. Pick another.");
    }
    const nextState: FlowOrderState = {
      ...state,
      shopMode: "product",
      selectedProductId: productId,
    };
    await updateFlowSession(session.id, { state: nextState });
    return buildProductMode(merchantId, nextState, productId);
  }

  // --- Cart: continue shopping / checkout / remove -------------------------
  if (mode === "cart") {
    const items = [...(state.items ?? [])];
    const action = str(payload, "cart_action");
    if (action === "remove") {
      if (!items.length) return buildCartMode(name, state, "Your cart is already empty.");
      const removed = items.pop();
      const nextState = { ...state, items, subtotalKobo: cartSubtotalKobo(items) };
      await updateFlowSession(session.id, { state: nextState });
      return buildCartMode(name, nextState, `Removed ${removed?.name ?? "the last item"}.`);
    }
    if (action === "checkout") {
      if (!items.length) {
        return buildCartMode(name, state, "Add at least one item before checking out.");
      }
      const nextState = { ...state, items, subtotalKobo: cartSubtotalKobo(items) };
      await updateFlowSession(session.id, { state: nextState, currentScreen: "DELIVERY" });
      return buildDeliveryScreen(merchantId);
    }
    // Continue shopping (default) — back to the catalogue view.
    const back: FlowOrderState = { ...state, shopMode: "catalogue", selectedProductId: undefined };
    await updateFlowSession(session.id, { state: back });
    return buildShopScreen(merchantId, back);
  }

  // --- Product ("Customize"): validate selection + add to cart -------------
  const productId = state.selectedProductId ?? "";
  const product = productId ? await loadProduct(productId, merchantId) : null;
  if (!product) {
    const back: FlowOrderState = { ...state, shopMode: "catalogue", selectedProductId: undefined };
    await updateFlowSession(session.id, { state: back });
    return buildShopScreen(merchantId, back, "That item is no longer available. Pick another.");
  }

  const items = [...(state.items ?? [])];
  const inStock = product.variants.filter((v) => v.stockQuantity > 0);
  const needSize = inStock.some((v) => v.size);
  const needColour = inStock.some((v) => v.colour);
  const chosenSize = str(payload, "size") || null;
  const chosenColour = str(payload, "colour") || null;

  let unitPriceKobo = product.priceKobo;
  let size: string | null = null;
  let colour: string | null = null;
  let resolvedVariantId: string | null = null;
  let availableStock = product.stockQuantity;

  if (product.variants.length) {
    if (needSize && !chosenSize) {
      return buildProductMode(merchantId, state, productId, "Choose a size.");
    }
    if (needColour && !chosenColour) {
      return buildProductMode(merchantId, state, productId, "Choose a colour.");
    }
    const variant = inStock.find(
      (v) =>
        (!needSize || v.size === chosenSize) &&
        (!needColour || v.colour === chosenColour)
    );
    if (!variant) {
      return buildProductMode(
        merchantId,
        state,
        productId,
        "That combination is unavailable. Pick another."
      );
    }
    resolvedVariantId = variant.id;
    size = variant.size ?? null;
    colour = variant.colour ?? null;
    unitPriceKobo = product.priceKobo + variant.priceAdjustmentKobo;
    availableStock = variant.stockQuantity;
  }

  const quantity = Math.trunc(Number(str(payload, "quantity") || "1"));
  const alreadyInCart = items
    .filter((i) => i.productId === productId && i.variantId === resolvedVariantId)
    .reduce((sum, i) => sum + i.quantity, 0);
  const maxAddable = Math.min(MAX_QUANTITY, availableStock - alreadyInCart);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return buildProductMode(merchantId, state, productId, "Choose a valid quantity.");
  }
  if (quantity > maxAddable) {
    return buildProductMode(
      merchantId,
      state,
      productId,
      maxAddable > 0
        ? `Only ${maxAddable} more of that item ${maxAddable === 1 ? "is" : "are"} available.`
        : "You already have all the available stock of that item in your cart."
    );
  }

  const variantLabel = variantLabelOf(size, colour) || null;
  const existing = items.find(
    (i) => i.productId === productId && i.variantId === resolvedVariantId
  );
  if (existing) {
    existing.quantity += quantity;
    existing.lineKobo = existing.unitPriceKobo * existing.quantity;
  } else {
    items.push({
      productId,
      variantId: resolvedVariantId,
      name: product.name,
      variantLabel,
      size,
      colour,
      quantity,
      unitPriceKobo,
      lineKobo: unitPriceKobo * quantity,
    });
  }

  const nextState: FlowOrderState = {
    ...state,
    items,
    subtotalKobo: cartSubtotalKobo(items),
    shopMode: "cart",
    selectedProductId: undefined,
  };
  await updateFlowSession(session.id, { state: nextState });
  return buildCartMode(
    name,
    nextState,
    `Added ${quantity} × ${product.name}. Continue shopping or check out.`
  );
}

async function handleDelivery(
  session: WhatsAppFlowSession,
  state: FlowOrderState,
  payload: Record<string, unknown>,
  flowToken: string
): Promise<FlowScreenResponse> {
  if (!state.merchantId || !(state.items ?? []).length) {
    return recoveryScreen(
      "DELIVERY",
      "Your order session expired. Close this and start a new order."
    );
  }
  const zone = await prisma.deliveryZone.findFirst({
    where: {
      id: str(payload, "delivery_zone"),
      merchantId: state.merchantId,
      active: true,
    },
    select: { id: true, name: true, feeKobo: true },
  });
  if (!zone) {
    return buildDeliveryScreen(state.merchantId, "Choose a delivery area.");
  }
  const isPickup = isPickupZone(zone.name);
  const address = str(payload, "address").trim();
  if (!isPickup && address.length < 5) {
    return buildDeliveryScreen(
      state.merchantId,
      "Enter the delivery address (house number, street, landmark)."
    );
  }

  const subtotalKobo = cartSubtotalKobo(state.items);
  const totalKobo = subtotalKobo + zone.feeKobo;
  const nextState: FlowOrderState = {
    ...state,
    deliveryZoneId: zone.id,
    deliveryZoneName: zone.name,
    address: isPickup ? address || "Store pickup" : address,
    subtotalKobo,
    deliveryFeeKobo: zone.feeKobo,
    totalKobo,
  };
  await updateFlowSession(session.id, {
    state: nextState,
    currentScreen: "REVIEW",
  });
  return buildReviewScreen(nextState, flowToken);
}

// ---- Entry point -----------------------------------------------------------

/**
 * Advances the Flow by one screen. `action` is Meta's data_exchange action
 * (INIT / data_exchange / BACK); `screen` is the screen the request came from.
 */
export async function resolveFlowScreen(input: {
  action: string;
  screen?: string;
  data?: Record<string, unknown>;
  flowToken: string;
  session: WhatsAppFlowSession;
}): Promise<FlowScreenResponse> {
  const state = readFlowState(input.session);
  const payload = input.data ?? {};
  const screen = input.screen ?? "";

  if (input.action === "INIT") {
    // Meta requires the INIT response to be the flow's ENTRY screen (START).
    // Returning any other screen here makes the client reject it ("Something
    // went wrong") and retry INIT. START is static, so an empty data payload is
    // correct; the customer picks Search/Marketplace and advances from there.
    return { screen: "START", data: {} };
  }

  if (input.action === "data_exchange" || input.action === "BACK") {
    switch (screen) {
      case "START":
        return handleStart(input.session, state, payload);
      case "ONBOARDING":
        return handleOnboarding(input.session, state, payload);
      case "SEARCH":
        return handleSearch(input.session, state, payload);
      case "SHOP":
        return handleShop(input.session, state, payload);
      case "DELIVERY":
        return handleDelivery(input.session, state, payload, input.flowToken);
      case "REVIEW":
        return handleReview(input.session, input.flowToken);
      default:
        return buildSearchScreen();
    }
  }

  return buildSearchScreen();
}
