import "server-only";
import type { WhatsAppFlowSession } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { calculateOrderTotal } from "@/lib/money";
import { generateOrderReference } from "@/lib/references";
import { createPaymentForOrder } from "@/lib/payments/service";
import { buildPaymentLinkText } from "@/lib/orders/summary";
import { sendToCustomer } from "@/lib/orders/outbound";
import { AUDIT, recordAudit } from "@/lib/orders/audit";
import { readFlowState, updateFlowSession } from "@/lib/whatsapp/flow-session";

export interface FlowOrderResult {
  orderRef: string;
  totalKobo: number;
  checkoutUrl: string;
  virtualAccount: {
    accountNumber?: string;
    bankName?: string;
    accountName?: string;
  } | null;
}

/**
 * Places the order from a Flow session's server-resolved cart and creates the
 * Monnify payment, returning the checkout link. Prices are RE-READ from
 * PostgreSQL at this moment (never trusting the cart's cached values); the
 * cached snapshot is only a fallback if a product vanished mid-flow. The
 * payment link is also sent to the chat as a durable backup, and the session is
 * marked complete so the Flow's own "Done" completion becomes a no-op.
 */
export async function finalizeFlowOrder(
  session: WhatsAppFlowSession
): Promise<FlowOrderResult | null> {
  const state = readFlowState(session);
  const items = state.items ?? [];
  if (!state.merchantId || !items.length) return null;
  const merchantId = state.merchantId;
  const waId = session.waId;

  // Apply the profile captured at first-time onboarding (name · email ·
  // referral). Only fills fields the customer provided; never blanks existing.
  const profile = {
    ...(state.onboardingName ? { name: state.onboardingName } : {}),
    ...(state.onboardingEmail ? { email: state.onboardingEmail } : {}),
    ...(state.referralCode ? { referralCode: state.referralCode } : {}),
  };
  const customer = await prisma.customer.upsert({
    where: { merchantId_waId: { merchantId, waId } },
    create: { merchantId, waId, phoneNumber: waId, ...profile },
    update: profile,
  });
  const conversation = await prisma.conversation.findFirst({
    where: { merchantId, customerId: customer.id },
    orderBy: { updatedAt: "desc" },
  });

  // Re-price from the database; fall back to the cart snapshot only if gone.
  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, merchantId, active: true },
    include: { variants: true },
  });
  const lines = items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    const variant = item.variantId
      ? product?.variants.find((v) => v.id === item.variantId)
      : null;
    const unitPriceKobo = product
      ? product.priceKobo + (variant?.priceAdjustmentKobo ?? 0)
      : item.unitPriceKobo;
    return {
      productId: item.productId,
      name: product?.name ?? item.name,
      unitPriceKobo,
      quantity: item.quantity,
      variantLabel: item.variantLabel,
    };
  });

  const isPickup = (state.deliveryZoneName ?? "").toLowerCase().includes("pickup");
  const totals = calculateOrderTotal({
    items: lines.map((l) => ({ unitPriceKobo: l.unitPriceKobo, quantity: l.quantity })),
    deliveryFeeKobo: state.deliveryFeeKobo ?? 0,
  });

  const order = await prisma.order.create({
    data: {
      reference: generateOrderReference(),
      merchantId,
      customerId: customer.id,
      conversationId: conversation?.id ?? null,
      state: "CONFIRMED",
      subtotalKobo: totals.subtotalKobo,
      deliveryFeeKobo: totals.deliveryFeeKobo,
      discountKobo: 0,
      totalKobo: totals.totalKobo,
      deliveryMethod: isPickup ? "PICKUP" : "DELIVERY",
      deliveryAddress: isPickup ? null : (state.address ?? null),
      deliveryZone: state.deliveryZoneName ?? null,
      notes: null,
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
    merchantId,
    orderId: order.id,
    conversationId: conversation?.id ?? null,
    event: AUDIT.CUSTOMER_CONFIRMED,
    actor: "CUSTOMER",
    metadata: { via: "flow", totalKobo: totals.totalKobo },
  });

  if (!isPickup && state.address) {
    await prisma.customer
      .update({ where: { id: customer.id }, data: { defaultAddress: state.address.slice(0, 200) } })
      .catch(() => {});
  }

  // Create the Monnify payment. Never let a payment hiccup lose the order — the
  // /pay page can retry — so fall back to the app checkout URL on failure.
  const fallbackUrl = `${env().APP_URL.replace(/\/$/, "")}/pay/${order.reference}`;
  let checkoutUrl = fallbackUrl;
  let virtualAccount: FlowOrderResult["virtualAccount"] = null;
  try {
    const result = await createPaymentForOrder(order.id);
    checkoutUrl = result.checkoutUrl ?? fallbackUrl;
    virtualAccount = (result.virtualAccount as FlowOrderResult["virtualAccount"]) ?? null;
    await recordAudit({
      merchantId,
      orderId: order.id,
      conversationId: conversation?.id ?? null,
      event: AUDIT.PAYMENT_LINK_SENT,
      metadata: { invoiceReference: result.payment.invoiceReference, via: "flow" },
    });
    if (conversation) {
      await prisma.conversation
        .update({ where: { id: conversation.id }, data: { state: "PAYMENT_PENDING" } })
        .catch(() => {});
    }
  } catch (err) {
    logger.warn("flow payment creation failed; using /pay fallback", {
      orderId: order.id,
      reason: err instanceof Error ? err.message : "unknown",
    });
  }

  // Durable chat backup of the payment link.
  let text = buildPaymentLinkText(order.totalKobo, order.reference, checkoutUrl);
  if (virtualAccount?.accountNumber && virtualAccount.bankName) {
    text += `\n\nOr transfer directly to:\n${virtualAccount.bankName}\n${virtualAccount.accountNumber}\n${virtualAccount.accountName ?? ""}`.trimEnd();
  }
  await sendToCustomer({
    merchantId,
    customer: { id: customer.id, waId },
    conversationId: conversation?.id ?? null,
    kind: "text",
    text,
  }).catch((e) =>
    logger.warn("flow payment link chat send failed", { reason: String(e) })
  );

  // Consume the session so the Flow's "Done" completion cannot re-place it.
  await updateFlowSession(session.id, {
    state: { ...state, orderRef: order.reference },
    completedAt: new Date(),
  });

  logger.info("flow order finalized", {
    merchantId,
    orderId: order.id,
    reference: order.reference,
  });
  return {
    orderRef: order.reference,
    totalKobo: order.totalKobo,
    checkoutUrl,
    virtualAccount,
  };
}
