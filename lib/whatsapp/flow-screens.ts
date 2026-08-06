import "server-only";
import type { WhatsAppFlowSession } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { formatNaira } from "@/lib/money";
import { searchScore } from "@/lib/orders/matching";
import {
  readFlowState,
  updateFlowSession,
  type FlowOrderState,
} from "@/lib/whatsapp/flow-session";

/**
 * Server-side resolver for the native ordering Flow. Given the decrypted
 * data-exchange request and the validated session, it computes the NEXT screen
 * entirely from PostgreSQL. Nothing the client echoes back — price, stock,
 * delivery fee, merchant id — is ever trusted: the client may only choose an id
 * from a list we previously served, and every id is re-validated against the
 * database before it advances the order.
 */

export interface FlowScreenResponse {
  screen: string;
  data: Record<string, unknown>;
}

const MAX_STORE_ROWS = 20;
const MAX_PRODUCT_ROWS = 12;
const MAX_QUANTITY = 10;
const SEARCH_THRESHOLD = 0.5;
const MAX_IMAGE_BYTES = 300_000; // Base64 of a larger image bloats the payload.

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

  return {
    screen: "SEARCH",
    data: {
      search_hint: hint,
      stores: storeRows(stores),
      ...(params.error ? { error_message: params.error } : {}),
    },
  };
}

// ---- Store catalogue -------------------------------------------------------

async function buildStoreScreen(
  merchantId: string,
  error?: string
): Promise<FlowScreenResponse> {
  const merchant = await prisma.merchant.findFirst({
    where: { id: merchantId, active: true },
    select: { name: true },
  });
  if (!merchant) {
    return buildSearchScreen({
      mode: "marketplace",
      error: "That store is no longer available.",
    });
  }
  const products = await prisma.product.findMany({
    where: { merchantId, active: true, stockQuantity: { gt: 0 } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: MAX_PRODUCT_ROWS,
    select: { id: true, name: true, priceKobo: true, stockQuantity: true },
  });
  if (!products.length) {
    return buildSearchScreen({
      mode: "marketplace",
      error: `${merchant.name} has no items available right now.`,
    });
  }
  const rows: Row[] = products.map((product) => ({
    id: product.id,
    title: title30(product.name),
    description: `${formatNaira(product.priceKobo)} · ${product.stockQuantity} in stock`,
  }));
  return {
    screen: "STORE",
    data: {
      store_name: merchant.name,
      products: rows,
      ...(error ? { error_message: error } : {}),
    },
  };
}

// ---- Item detail -----------------------------------------------------------

type ProductWithVariants = NonNullable<
  Awaited<ReturnType<typeof loadProduct>>
>;

function loadProduct(productId: string, merchantId: string) {
  return prisma.product.findFirst({
    where: {
      id: productId,
      merchantId,
      active: true,
      stockQuantity: { gt: 0 },
    },
    include: { variants: true },
  });
}

function distinctVariantValues(
  product: ProductWithVariants,
  key: "size" | "colour"
): string[] {
  return [
    ...new Set(
      product.variants
        .filter((variant) => variant.stockQuantity > 0)
        .map((variant) => variant[key])
        .filter((value): value is string => Boolean(value))
    ),
  ];
}

async function productImageBase64(
  product: ProductWithVariants
): Promise<string | null> {
  const allowGenerated =
    product.imageSource !== "AI_GENERATED" ||
    Boolean(product.imageApprovedAt) ||
    env().ALLOW_UNAPPROVED_AI_PRODUCT_IMAGES;
  if (!allowGenerated) return null;

  const asset = await prisma.productImageAsset.findUnique({
    where: { productId: product.id },
    select: { bytes: true, sizeBytes: true },
  });
  if (!asset || asset.sizeBytes > MAX_IMAGE_BYTES) return null;
  return Buffer.from(asset.bytes).toString("base64");
}

async function buildItemScreen(
  product: ProductWithVariants,
  error?: string
): Promise<FlowScreenResponse> {
  const maxQty = Math.min(MAX_QUANTITY, product.stockQuantity);
  const quantities: Row[] = Array.from({ length: maxQty }, (_, index) => ({
    id: String(index + 1),
    title: String(index + 1),
  }));
  const sizes = distinctVariantValues(product, "size");
  const colours = distinctVariantValues(product, "colour");
  const image = await productImageBase64(product);

  return {
    screen: "ITEM",
    data: {
      product_name: product.name,
      price_label: `${formatNaira(product.priceKobo)} each`,
      has_image: Boolean(image),
      product_image: image ?? "",
      quantities,
      has_sizes: sizes.length > 0,
      sizes: sizes.map((size) => ({ id: size, title: size })),
      has_colours: colours.length > 0,
      colours: colours.map((colour) => ({ id: colour, title: colour })),
      ...(error ? { error_message: error } : {}),
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
  return {
    screen: "DELIVERY",
    data: {
      zones: rows,
      ...(rows.length
        ? {}
        : { error_message: "This store has not set delivery areas yet." }),
      ...(error ? { error_message: error } : {}),
    },
  };
}

// ---- Review (terminal) -----------------------------------------------------

async function buildReviewScreen(
  state: FlowOrderState,
  flowToken: string
): Promise<FlowScreenResponse> {
  const product = state.productId
    ? await prisma.product.findUnique({
        where: { id: state.productId },
        select: { name: true },
      })
    : null;
  const variantBits = [state.size, state.colour].filter(Boolean).join(", ");
  const line1 = `${state.quantity ?? 1} × ${product?.name ?? "item"}${
    variantBits ? ` (${variantBits})` : ""
  }`;
  const isPickup = (state.deliveryZoneName ?? "").toLowerCase() === "pickup";
  const deliveryLine = state.deliveryZoneName
    ? `${isPickup ? "Pickup at" : "Deliver to"} ${state.deliveryZoneName}`
    : "";
  const addressLine = !isPickup && state.address ? state.address : "";
  const summaryLines = [line1, deliveryLine, addressLine].filter(Boolean);
  const breakdown = `Items ${formatNaira(state.subtotalKobo ?? 0)} + delivery ${formatNaira(
    state.deliveryFeeKobo ?? 0
  )}`;

  return {
    screen: "REVIEW",
    data: {
      summary: `${summaryLines.join("\n")}\n\n${breakdown}`,
      total_label: `Total: ${formatNaira(state.totalKobo ?? 0)}`,
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
      select: { id: true },
    });
    if (!merchant) {
      return buildSearchScreen({
        mode,
        query,
        error: "That store is no longer available.",
      });
    }
    await updateFlowSession(session.id, {
      state: { ...state, merchantId: merchant.id },
      merchantId: merchant.id,
      currentScreen: "STORE",
    });
    return buildStoreScreen(merchant.id);
  }

  return buildSearchScreen({ mode, query });
}

async function handleStore(
  session: WhatsAppFlowSession,
  state: FlowOrderState,
  payload: Record<string, unknown>
): Promise<FlowScreenResponse> {
  if (!state.merchantId) {
    return buildSearchScreen({
      mode: "marketplace",
      error: "Your session reset. Pick a store again.",
    });
  }
  const product = await loadProduct(str(payload, "product_id"), state.merchantId);
  if (!product) {
    return buildStoreScreen(
      state.merchantId,
      "That product is no longer available."
    );
  }
  await updateFlowSession(session.id, {
    state: { ...state, productId: product.id },
    currentScreen: "ITEM",
  });
  return buildItemScreen(product);
}

async function handleItem(
  session: WhatsAppFlowSession,
  state: FlowOrderState,
  payload: Record<string, unknown>
): Promise<FlowScreenResponse> {
  if (!state.merchantId || !state.productId) {
    return buildSearchScreen({
      mode: "marketplace",
      error: "Your session reset. Pick a store again.",
    });
  }
  const product = await loadProduct(state.productId, state.merchantId);
  if (!product) {
    return buildStoreScreen(
      state.merchantId,
      "That product is no longer available."
    );
  }

  const quantity = Math.trunc(Number(str(payload, "quantity")));
  const maxQty = Math.min(MAX_QUANTITY, product.stockQuantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQty) {
    return buildItemScreen(product, "Choose a valid quantity.");
  }

  const sizes = distinctVariantValues(product, "size");
  const colours = distinctVariantValues(product, "colour");
  let variantId: string | null = null;
  let size: string | null = null;
  let colour: string | null = null;
  let unitPriceKobo = product.priceKobo;

  if (sizes.length || colours.length) {
    if (sizes.length) {
      size = str(payload, "size");
      if (!size || !sizes.includes(size)) {
        return buildItemScreen(product, "Select a size.");
      }
    }
    if (colours.length) {
      colour = str(payload, "colour");
      if (!colour || !colours.includes(colour)) {
        return buildItemScreen(product, "Select a colour.");
      }
    }
    const variant = product.variants.find(
      (candidate) =>
        (candidate.size ?? null) === (size || null) &&
        (candidate.colour ?? null) === (colour || null)
    );
    if (!variant || variant.stockQuantity < quantity) {
      return buildItemScreen(product, "That option is out of stock.");
    }
    variantId = variant.id;
    unitPriceKobo = product.priceKobo + variant.priceAdjustmentKobo;
  }

  const subtotalKobo = unitPriceKobo * quantity;
  await updateFlowSession(session.id, {
    state: {
      ...state,
      quantity,
      size,
      colour,
      variantId,
      unitPriceKobo,
      subtotalKobo,
    },
    currentScreen: "DELIVERY",
  });
  return buildDeliveryScreen(state.merchantId);
}

async function handleDelivery(
  session: WhatsAppFlowSession,
  state: FlowOrderState,
  payload: Record<string, unknown>,
  flowToken: string
): Promise<FlowScreenResponse> {
  if (!state.merchantId || !state.productId || !state.quantity) {
    return buildSearchScreen({
      mode: "marketplace",
      error: "Your session reset. Pick a store again.",
    });
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
  const isPickup = zone.name.toLowerCase() === "pickup";
  const address = str(payload, "address").trim();
  if (!isPickup && address.length < 5) {
    return buildDeliveryScreen(
      state.merchantId,
      "Enter the delivery address (house number, street, landmark)."
    );
  }

  const subtotalKobo = state.subtotalKobo ?? 0;
  const totalKobo = subtotalKobo + zone.feeKobo;
  const nextState: FlowOrderState = {
    ...state,
    deliveryZoneId: zone.id,
    deliveryZoneName: zone.name,
    address: isPickup ? address || "Store pickup" : address,
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
      case "STORE":
        return handleStore(input.session, state, payload);
      case "ITEM":
        return handleItem(input.session, state, payload);
      case "DELIVERY":
        return handleDelivery(input.session, state, payload, input.flowToken);
      default:
        return buildSearchScreen({ mode: "marketplace" });
    }
  }

  return buildSearchScreen({ mode: "marketplace" });
}
