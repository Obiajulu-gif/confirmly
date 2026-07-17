import "server-only";
import { prisma } from "@/lib/db";
import { calculateOrderTotal } from "@/lib/money";
import { generateOrderReference, generateInvoiceReference, generateReceiptToken } from "@/lib/references";

/**
 * Demo fixtures — used ONLY by the protected demo reset action. Demo orders
 * are tagged so they can be wiped and re-created without touching real data.
 * Demo payments use provider DEMO and can never be confused with verified
 * Monnify transactions.
 */

export const DEMO_TAG = "[DEMO]";

export async function resetDemoData(merchantId: string) {
  // Wipe previous demo orders (cascade removes items/payments/receipts).
  const demoCustomers = await prisma.customer.findMany({
    where: { merchantId, name: { startsWith: DEMO_TAG } },
    select: { id: true },
  });
  const ids = demoCustomers.map((c) => c.id);
  if (ids.length) {
    await prisma.order.deleteMany({
      where: { merchantId, customerId: { in: ids } },
    });
    await prisma.conversation.deleteMany({
      where: { merchantId, customerId: { in: ids } },
    });
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  }

  const products = await prisma.product.findMany({
    where: { merchantId, active: true },
    orderBy: { name: "asc" },
  });
  const polo = products.find((p) => p.name.includes("Polo"));
  const tote = products.find((p) => p.name.includes("Tote"));
  const zone = await prisma.deliveryZone.findFirst({
    where: { merchantId, name: "Yaba" },
  });
  if (!polo || !tote || !zone) {
    throw new Error("seed catalogue missing — run `npm run db:seed` first");
  }

  // --- Completed order (paid + receipted) --------------------------------
  const paidCustomer = await prisma.customer.create({
    data: {
      merchantId,
      waId: `demo-paid-${Date.now()}`,
      phoneNumber: "+2348012340001",
      name: `${DEMO_TAG} Chidinma O.`,
    },
  });
  const paidTotals = calculateOrderTotal({
    items: [{ unitPriceKobo: polo.priceKobo, quantity: 2 }],
    deliveryFeeKobo: zone.feeKobo,
  });
  const paidRef = generateOrderReference();
  await prisma.order.create({
    data: {
      reference: paidRef,
      merchantId,
      customerId: paidCustomer.id,
      state: "PAID",
      subtotalKobo: paidTotals.subtotalKobo,
      deliveryFeeKobo: paidTotals.deliveryFeeKobo,
      totalKobo: paidTotals.totalKobo,
      deliveryMethod: "DELIVERY",
      deliveryZone: zone.name,
      deliveryAddress: "12 Demo Street, Yaba",
      notes: `${DEMO_TAG} seeded example — not a real payment`,
      confirmedAt: new Date(Date.now() - 3600_000),
      paidAt: new Date(Date.now() - 3000_000),
      items: {
        create: [
          {
            productId: polo.id,
            productNameSnapshot: polo.name,
            unitPriceKoboSnapshot: polo.priceKobo,
            quantity: 2,
            variantSnapshot: "Black / L",
            lineTotalKobo: paidTotals.lineTotalsKobo[0] ?? 0,
          },
        ],
      },
      payment: {
        create: {
          provider: "DEMO",
          state: "PAID",
          invoiceReference: generateInvoiceReference(paidRef, 1),
          expectedAmountKobo: paidTotals.totalKobo,
          paidAmountKobo: paidTotals.totalKobo,
          method: "DEMO_FIXTURE",
          verifiedAt: new Date(Date.now() - 3000_000),
          sanitizedResponse: { mode: "demo", note: "fixture — no real payment" },
        },
      },
      receipt: { create: { token: generateReceiptToken() } },
    },
  });

  // --- Pending order -------------------------------------------------------
  const pendingCustomer = await prisma.customer.create({
    data: {
      merchantId,
      waId: `demo-pending-${Date.now()}`,
      phoneNumber: "+2348012340002",
      name: `${DEMO_TAG} Emeka A.`,
    },
  });
  const pendingTotals = calculateOrderTotal({
    items: [{ unitPriceKobo: tote.priceKobo, quantity: 1 }],
    deliveryFeeKobo: zone.feeKobo,
  });
  const pendingRef = generateOrderReference();
  await prisma.order.create({
    data: {
      reference: pendingRef,
      merchantId,
      customerId: pendingCustomer.id,
      state: "PAYMENT_PENDING",
      subtotalKobo: pendingTotals.subtotalKobo,
      deliveryFeeKobo: pendingTotals.deliveryFeeKobo,
      totalKobo: pendingTotals.totalKobo,
      deliveryMethod: "DELIVERY",
      deliveryZone: zone.name,
      notes: `${DEMO_TAG} seeded example — awaiting (fake) payment`,
      confirmedAt: new Date(Date.now() - 600_000),
      items: {
        create: [
          {
            productId: tote.id,
            productNameSnapshot: tote.name,
            unitPriceKoboSnapshot: tote.priceKobo,
            quantity: 1,
            lineTotalKobo: pendingTotals.lineTotalsKobo[0] ?? 0,
          },
        ],
      },
      payment: {
        create: {
          provider: "DEMO",
          state: "PENDING",
          invoiceReference: generateInvoiceReference(pendingRef, 1),
          expectedAmountKobo: pendingTotals.totalKobo,
          sanitizedResponse: { mode: "demo", note: "fixture — no real payment" },
        },
      },
    },
  });

  return { paidOrderReference: paidRef, pendingOrderReference: pendingRef };
}
