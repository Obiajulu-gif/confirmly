import "server-only";
import type { FulfilmentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/orders/audit";
import { sendToCustomer } from "@/lib/orders/outbound";

/**
 * Post-payment fulfilment lifecycle. Kept separate from OrderState so payment
 * and settlement logic is never coupled to operational status. A merchant may
 * only move an order FORWARD through the lifecycle; each change notifies the
 * customer on WhatsApp.
 */

function isPickup(deliveryMethod: string | null | undefined): boolean {
  return (deliveryMethod ?? "").toUpperCase() === "PICKUP";
}

/** Forward-only transitions allowed from a status, given the delivery method. */
export function nextFulfilmentOptions(
  status: FulfilmentStatus,
  deliveryMethod: string | null | undefined
): FulfilmentStatus[] {
  switch (status) {
    case "RECEIVED":
      return ["PREPARING"];
    case "PREPARING":
      return ["READY"];
    case "READY":
      return isPickup(deliveryMethod) ? ["DELIVERED"] : ["OUT_FOR_DELIVERY"];
    case "OUT_FOR_DELIVERY":
      return ["DELIVERED"];
    default:
      // AWAITING_PAYMENT (not paid yet) and DELIVERED (terminal) have no moves.
      return [];
  }
}

/** Merchant-facing button label for moving an order TO a status. */
export function fulfilmentActionLabel(
  to: FulfilmentStatus,
  deliveryMethod?: string | null
): string {
  switch (to) {
    case "PREPARING":
      return "Start preparing";
    case "READY":
      return isPickup(deliveryMethod) ? "Ready for pickup" : "Mark ready";
    case "OUT_FOR_DELIVERY":
      return "Out for delivery";
    case "DELIVERED":
      return isPickup(deliveryMethod) ? "Mark collected" : "Mark delivered";
    default:
      return to;
  }
}

/** Short human label for a status (badges, timeline). */
export function fulfilmentStatusLabel(status: FulfilmentStatus): string {
  return {
    AWAITING_PAYMENT: "Awaiting payment",
    RECEIVED: "Order received",
    PREPARING: "Preparing",
    READY: "Ready",
    OUT_FOR_DELIVERY: "Out for delivery",
    DELIVERED: "Delivered",
  }[status];
}

/** The WhatsApp message a customer receives when their order reaches `status`. */
export function fulfilmentMessage(
  status: FulfilmentStatus,
  ctx: { storeName: string; reference: string; pickup: boolean }
): string {
  const ref = ctx.reference;
  switch (status) {
    case "PREPARING":
      return `👨‍🍳 ${ctx.storeName} is preparing your order *${ref}*. We'll let you know the moment it's ready.`;
    case "READY":
      return ctx.pickup
        ? `✅ Your order *${ref}* is ready for pickup at ${ctx.storeName}. Come by whenever you're ready.`
        : `✅ Your order *${ref}* is ready and will be dispatched shortly.`;
    case "OUT_FOR_DELIVERY":
      return `🛵 Your order *${ref}* is on the way! It's out for delivery now.`;
    case "DELIVERED":
      return ctx.pickup
        ? `📦 Order *${ref}* collected. Thanks for ordering from ${ctx.storeName}! Reply "order" to shop again.`
        : `📦 Your order *${ref}* has been delivered. Thanks for ordering from ${ctx.storeName}! Reply "order" to shop again.`;
    default:
      return `Your order *${ref}* status is now ${fulfilmentStatusLabel(status)}.`;
  }
}

export class FulfilmentError extends Error {
  constructor(
    message: string,
    public readonly status: number = 409
  ) {
    super(message);
    this.name = "FulfilmentError";
  }
}

/**
 * Advances an order's fulfilment status, records the event + audit trail, and
 * notifies the customer. Authorization is the caller's responsibility. Returns
 * whether the WhatsApp notification was actually delivered — a send failure
 * (e.g. outside WhatsApp's 24h service window) never rolls back the status
 * change and is never reported as delivered.
 */
export async function advanceFulfilment(params: {
  orderId: string;
  to: FulfilmentStatus;
  actorType?: "MERCHANT" | "SYSTEM";
  actorId?: string | null;
}): Promise<{ status: FulfilmentStatus; notified: boolean }> {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: {
      customer: { select: { id: true, waId: true } },
      merchant: { select: { name: true } },
    },
  });
  if (!order) throw new FulfilmentError("order not found", 404);

  const options = nextFulfilmentOptions(order.fulfilmentStatus, order.deliveryMethod);
  if (!options.includes(params.to)) {
    throw new FulfilmentError(
      `cannot move ${order.fulfilmentStatus} → ${params.to}`,
      409
    );
  }

  const actorType = params.actorType ?? "MERCHANT";
  const pickup = isPickup(order.deliveryMethod);

  // Bridge the coarse OrderState so existing reports/metrics stay meaningful.
  const orderData: Prisma.OrderUpdateInput = { fulfilmentStatus: params.to };
  if (
    params.to === "PREPARING" &&
    (order.state === "PAID" || order.state === "NEEDS_ATTENTION")
  ) {
    orderData.state = "FULFILLING";
  }
  if (params.to === "DELIVERED") {
    orderData.state = "COMPLETED";
    orderData.fulfilledAt = new Date();
  }

  const event = await prisma.$transaction(
    async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: orderData });
      const ev = await tx.fulfilmentEvent.create({
        data: {
          orderId: order.id,
          status: params.to,
          actorType,
          actorId: params.actorId ?? null,
          notified: false,
        },
      });
      await recordAudit({
        tx,
        merchantId: order.merchantId,
        orderId: order.id,
        conversationId: order.conversationId,
        event: `Fulfilment: ${fulfilmentStatusLabel(params.to)}`,
        actor: actorType,
        metadata: { from: order.fulfilmentStatus, to: params.to },
      });
      return ev;
    },
    { timeout: 20_000, maxWait: 10_000 }
  );

  // Notify the customer OUTSIDE the transaction. Never fake delivery.
  let notified = false;
  try {
    await sendToCustomer({
      merchantId: order.merchantId,
      customer: order.customer,
      conversationId: order.conversationId,
      kind: "text",
      text: fulfilmentMessage(params.to, {
        storeName: order.merchant.name,
        reference: order.reference,
        pickup,
      }),
    });
    notified = true;
    await prisma.fulfilmentEvent.update({
      where: { id: event.id },
      data: { notified: true },
    });
  } catch (err) {
    logger.warn("fulfilment notification not delivered", {
      orderId: order.id,
      to: params.to,
      reason: err instanceof Error ? err.message : "unknown",
    });
  }

  return { status: params.to, notified };
}
