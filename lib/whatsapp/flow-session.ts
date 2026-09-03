import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { WhatsAppFlowSession } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Server-side state for a native WhatsApp ordering Flow. The raw flow_token is
 * a bearer secret shared with the client, so only its SHA-256 is ever stored;
 * the data-exchange endpoint validates the presented token against the hash
 * (and the expiry) before resolving any screen.
 */

/** Flow sessions live only as long as an order takes to place. */
export const FLOW_SESSION_TTL_MINUTES = 30;

/** One line in the Flow cart. Every value is resolved from PostgreSQL. */
export interface FlowCartItem {
  productId: string;
  variantId: string | null;
  name: string;
  variantLabel: string | null;
  size: string | null;
  colour: string | null;
  quantity: number;
  unitPriceKobo: number;
  lineKobo: number;
}

/** Accumulated, server-resolved selections. Never populated from client echoes. */
export interface FlowOrderState {
  entryPoint?: "search" | "marketplace";
  merchantId?: string;
  storeName?: string;
  /** Which SHOP view the customer is on (catalogue → product → cart loop). */
  shopMode?: "catalogue" | "product" | "cart";
  /** The product being customized in the "product" view. */
  selectedProductId?: string;
  /** The multi-item cart, grown one SHOP re-render at a time. */
  items?: FlowCartItem[];
  deliveryZoneId?: string | null;
  deliveryZoneName?: string | null;
  address?: string | null;
  subtotalKobo?: number;
  deliveryFeeKobo?: number;
  totalKobo?: number;
  /** Set once the order is placed from REVIEW, so completion can't re-place it. */
  orderRef?: string;
}

/** Sum of the cart's line totals. */
export function cartSubtotalKobo(items: FlowCartItem[] | undefined): number {
  return (items ?? []).reduce((sum, item) => sum + item.lineKobo, 0);
}

export function hashFlowToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface CreatedFlowSession {
  /** The raw token — send this to WhatsApp; it is never persisted in the clear. */
  token: string;
  session: WhatsAppFlowSession;
}

/** Mints a fresh session and returns the raw token to hand to `sendFlow`. */
export async function createFlowSession(params: {
  waId: string;
  merchantId?: string | null;
  /** Pre-seed the accumulated state (e.g. launching straight into a store). */
  state?: FlowOrderState;
  /** The screen the Flow is launched on, so the endpoint stays in sync. */
  currentScreen?: string;
  ttlMinutes?: number;
}): Promise<CreatedFlowSession> {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(
    Date.now() + (params.ttlMinutes ?? FLOW_SESSION_TTL_MINUTES) * 60_000
  );
  const session = await prisma.whatsAppFlowSession.create({
    data: {
      tokenHash: hashFlowToken(token),
      waId: params.waId,
      merchantId: params.merchantId ?? null,
      state: (params.state ?? {}) as object,
      ...(params.currentScreen ? { currentScreen: params.currentScreen } : {}),
      expiresAt,
    },
  });
  return { token, session };
}

/**
 * A session may drive the endpoint only while it is neither completed nor
 * expired. Pure so it can be unit-tested without a database.
 */
export function isFlowSessionUsable(
  session: Pick<WhatsAppFlowSession, "completedAt" | "expiresAt">,
  now: number = Date.now()
): boolean {
  if (session.completedAt) return false;
  return session.expiresAt.getTime() > now;
}

/**
 * Resolves a presented flow_token to its (unexpired) session. Returns null when
 * the token is unknown or the session has expired — callers must treat both as
 * an invalid token and refuse the request.
 */
export async function getValidFlowSession(
  token: string
): Promise<WhatsAppFlowSession | null> {
  if (!token) return null;
  const session = await prisma.whatsAppFlowSession.findUnique({
    where: { tokenHash: hashFlowToken(token) },
  });
  if (!session) return null;
  return isFlowSessionUsable(session) ? session : null;
}

export function readFlowState(session: WhatsAppFlowSession): FlowOrderState {
  const raw = session.state;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as FlowOrderState;
}

/** Persists the accumulated state and the screen the customer is now on. */
export async function updateFlowSession(
  id: string,
  patch: {
    state?: FlowOrderState;
    currentScreen?: string;
    merchantId?: string | null;
    completedAt?: Date;
  }
): Promise<void> {
  await prisma.whatsAppFlowSession.update({
    where: { id },
    data: {
      ...(patch.state ? { state: patch.state as object } : {}),
      ...(patch.currentScreen ? { currentScreen: patch.currentScreen } : {}),
      ...(patch.merchantId !== undefined ? { merchantId: patch.merchantId } : {}),
      ...(patch.completedAt ? { completedAt: patch.completedAt } : {}),
    },
  });
}

/** Marks a session consumed so a replayed token cannot re-submit the order. */
export async function completeFlowSession(id: string): Promise<void> {
  await prisma.whatsAppFlowSession.update({
    where: { id },
    data: { completedAt: new Date() },
  });
}
