import "server-only";
import type { WhatsAppFlowSession } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { searchScore } from "@/lib/orders/matching";
import {
  cartSubtotalKobo,
  readFlowState,
  updateFlowSession,
  type FlowCartItem,
  type FlowOrderState,
} from "@/lib/whatsapp/flow-session";

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
const MAX_SKU_ROWS = 30;
const MAX_QUANTITY = 10;
const SEARCH_THRESHOLD = 0.5;
/** Separates productId from variantId inside a SHOP sku row id. */
const SKU_SEP = "::";

type Row = { id: string; title: string; description?: string };

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
        data: {
          search_hint: "Type a store name or code and tap Continue.",
          has_stores: false,
          stores: [],
          ...base,
        },
      };
  }
}

// ---- Store list / search ---------------------------------------------------

async function listActiveStores() {
  return prisma.merchant.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    take: MAX_STORE_ROWS,
    select: { id: true, name: true, category: true, storeCode: true },
  });
}

function storeRows(
  stores: Array<{ name: string; category: string | null; storeCode: string; id: string }>
): Row[] {
  return stores.map((store) => ({
    id: store.id,
    title: title30(store.name),
    description: `${store.category ?? "Store"} · ${store.storeCode}`,
  }));
}

async function searchStores(query: string) {
  const stores = await prisma.merchant.findMany({
    where: { active: true },
    select: { id: true, name: true, category: true, storeCode: true },
  });
  return stores
    .map((store) => ({
      store,
      score: Math.max(
        searchScore(query, store.name),
        searchScore(query, store.category ?? ""),
        searchScore(query, store.storeCode)
      ),
    }))
    .filter((entry) => entry.score >= SEARCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_STORE_ROWS)
    .map((entry) => entry.store);
}

async function buildSearchScreen(params: {
  mode: "search" | "marketplace";
  query?: string | null;
  error?: string;
}): Promise<FlowScreenResponse> {
  const query = params.query?.trim() ?? "";
  let stores: Array<{
    id: string;
    name: string;
    category: string | null;
    storeCode: string;
  }>;
  if (query) stores = await searchStores(query);
  else if (params.mode === "marketplace") stores = await listActiveStores();
  else stores = [];

  const hint = query
    ? `Results for "${query}". Pick a store, or edit your search and tap Continue.`
    : params.mode === "marketplace"
      ? "Pick a store to browse, or type a name to search."
      : "Type a store name or code, then tap Continue.";

  const rows = storeRows(stores);
  return {
    screen: "SEARCH",
    data: {
      search_hint: hint,
      has_stores: rows.length > 0,
      stores: rows,
      ...errorFields(params.error),
    },
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

/** Expands the merchant's catalogue into one purchasable SKU row per variant. */
async function buildSkuRows(merchantId: string): Promise<Row[]> {
  const products = await prisma.product.findMany({
    where: { merchantId, active: true, stockQuantity: { gt: 0 } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { variants: true },
  });
  const rows: Row[] = [];
  for (const product of products) {
    const inStockVariants = product.variants.filter((v) => v.stockQuantity > 0);
    if (inStockVariants.length) {
      for (const variant of inStockVariants) {
        const label = variantLabelOf(variant.size, variant.colour) || "Option";
        const price = product.priceKobo + variant.priceAdjustmentKobo;
        rows.push({
          id: `${product.id}${SKU_SEP}${variant.id}`,
          title: title30(`${product.name} — ${label}`),
          description: `${formatNaira(price)} · ${variant.stockQuantity} left`,
        });
        if (rows.length >= MAX_SKU_ROWS) return rows;
      }
    } else {
      rows.push({
        id: product.id,
        title: title30(product.name),
        description: `${formatNaira(product.priceKobo)} · ${product.stockQuantity} in stock`,
      });
      if (rows.length >= MAX_SKU_ROWS) return rows;
    }
  }
  return rows;
}

function cartLines(items: FlowCartItem[]): string {
  return items
    .map((item) => {
      const label = item.variantLabel ? ` (${item.variantLabel})` : "";
      return `${item.quantity} × ${item.name}${label} — ${formatNaira(item.lineKobo)}`;
    })
    .join("\n");
}

async function buildShopScreen(
  merchantId: string,
  state: FlowOrderState,
  error?: string
): Promise<FlowScreenResponse> {
  const merchant = await prisma.merchant.findFirst({
    where: { id: merchantId, active: true },
    select: { name: true },
  });
  if (!merchant) {
    return recoveryScreen(
      "SHOP",
      "That store is no longer available. Close this and start again."
    );
  }
  const skus = await buildSkuRows(merchantId);
  const items = state.items ?? [];
  const subtotal = cartSubtotalKobo(items);
  const summary = items.length
    ? `🛒 Your cart\n${cartLines(items)}`
    : "Your cart is empty. Pick an item below and choose “Add this item”.";

  return {
    screen: "SHOP",
    data: {
      store_name: merchant.name,
      has_cart: items.length > 0,
      cart_summary: summary,
      cart_total: items.length ? `Subtotal: ${formatNaira(subtotal)}` : "",
      has_skus: skus.length > 0,
      skus,
      ...errorFields(error),
    },
  };
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

// ---- Transition handlers ---------------------------------------------------

async function handleStart(
  session: WhatsAppFlowSession,
  state: FlowOrderState,
  payload: Record<string, unknown>
): Promise<FlowScreenResponse> {
  const mode = str(payload, "entry_point") === "search" ? "search" : "marketplace";
  await updateFlowSession(session.id, {
    state: { ...state, entryPoint: mode },
    currentScreen: "SEARCH",
  });
  return buildSearchScreen({ mode });
}

async function handleSearch(
  session: WhatsAppFlowSession,
  state: FlowOrderState,
  payload: Record<string, unknown>
): Promise<FlowScreenResponse> {
  const mode = state.entryPoint === "search" ? "search" : "marketplace";
  const storeId = str(payload, "store_id");
  const query = str(payload, "store_query");

  if (storeId) {
    const merchant = await prisma.merchant.findFirst({
      where: { id: storeId, active: true },
      select: { id: true, name: true },
    });
    if (!merchant) {
      return buildSearchScreen({
        mode,
        query,
        error: "That store is no longer available. Pick another.",
      });
    }
    // Confirm the store has something to sell before advancing — SEARCH can
    // re-render itself with a hint, but SHOP cannot navigate back to SEARCH.
    const productCount = await prisma.product.count({
      where: { merchantId: merchant.id, active: true, stockQuantity: { gt: 0 } },
    });
    if (productCount === 0) {
      return buildSearchScreen({
        mode,
        query,
        error: `${merchant.name} has no items available right now. Try another store.`,
      });
    }
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

  return buildSearchScreen({ mode, query });
}

/** Parses a SHOP sku row id into its product and optional variant ids. */
function parseSku(sku: string): { productId: string; variantId: string | null } {
  const [productId, variantId] = sku.split(SKU_SEP);
  return { productId: productId ?? "", variantId: variantId ?? null };
}

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
  const items = [...(state.items ?? [])];
  const action = str(payload, "next_action");

  // --- Remove the last item ------------------------------------------------
  if (action === "remove") {
    if (!items.length) {
      return buildShopScreen(merchantId, state, "Your cart is already empty.");
    }
    const removed = items.pop();
    const nextState = { ...state, items, subtotalKobo: cartSubtotalKobo(items) };
    await updateFlowSession(session.id, { state: nextState });
    return buildShopScreen(
      merchantId,
      nextState,
      `Removed ${removed?.name ?? "the last item"}.`
    );
  }

  // --- Checkout ------------------------------------------------------------
  if (action === "checkout") {
    if (!items.length) {
      return buildShopScreen(
        merchantId,
        state,
        "Add at least one item to your cart before checking out."
      );
    }
    const nextState = { ...state, items, subtotalKobo: cartSubtotalKobo(items) };
    await updateFlowSession(session.id, {
      state: nextState,
      currentScreen: "DELIVERY",
    });
    return buildDeliveryScreen(merchantId);
  }

  // --- Add an item (default) ----------------------------------------------
  const { productId, variantId } = parseSku(str(payload, "sku"));
  if (!productId) {
    return buildShopScreen(merchantId, state, "Pick an item to add to your cart.");
  }
  const product = await loadProduct(productId, merchantId);
  if (!product) {
    return buildShopScreen(
      merchantId,
      state,
      "That item just sold out. Pick another."
    );
  }

  let unitPriceKobo = product.priceKobo;
  let size: string | null = null;
  let colour: string | null = null;
  let resolvedVariantId: string | null = null;
  let availableStock = product.stockQuantity;

  if (variantId) {
    const variant = product.variants.find(
      (candidate) => candidate.id === variantId && candidate.stockQuantity > 0
    );
    if (!variant) {
      return buildShopScreen(
        merchantId,
        state,
        "That option is out of stock. Pick another."
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
    return buildShopScreen(merchantId, state, "Choose a valid quantity.");
  }
  if (quantity > maxAddable) {
    return buildShopScreen(
      merchantId,
      state,
      maxAddable > 0
        ? `Only ${maxAddable} more of that item ${maxAddable === 1 ? "is" : "are"} available.`
        : "You already have all the available stock of that item in your cart."
    );
  }

  const variantLabel = variantLabelOf(size, colour) || null;
  // Merge with an identical line if present, else append.
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

  const nextState = { ...state, items, subtotalKobo: cartSubtotalKobo(items) };
  await updateFlowSession(session.id, { state: nextState });
  return buildShopScreen(
    merchantId,
    nextState,
    `Added ${quantity} × ${product.name}. Add more, or choose Checkout.`
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
    return buildSearchScreen({ mode: "marketplace" });
  }

  if (input.action === "data_exchange" || input.action === "BACK") {
    switch (screen) {
      case "START":
        return handleStart(input.session, state, payload);
      case "SEARCH":
        return handleSearch(input.session, state, payload);
      case "SHOP":
        return handleShop(input.session, state, payload);
      case "DELIVERY":
        return handleDelivery(input.session, state, payload, input.flowToken);
      default:
        return buildSearchScreen({ mode: "marketplace" });
    }
  }

  return buildSearchScreen({ mode: "marketplace" });
}
