import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { applyVerifiedTransaction } from "@/lib/payments/service";
import { calculateOrderTotal } from "@/lib/money";
import {
  generateInvoiceReference,
  generateOrderReference,
} from "@/lib/references";
import type { VerifiedTransaction } from "@/lib/monnify/client";

/**
 * Integration tests against the local dev database. Each run uses its own
 * merchant so it never touches seeded or real data.
 */

let merchantId: string;
let customerId: string;

function verified(overrides: Partial<VerifiedTransaction>): VerifiedTransaction {
  return {
    paymentStatus: "PAID",
    amountPaidNaira: 26_500,
    totalPayableNaira: 26_500,
    currencyCode: "NGN",
    paymentMethod: "ACCOUNT_TRANSFER",
    transactionReference: `MNFY-TEST-${Math.random().toString(36).slice(2)}`,
    paymentReference: null,
    paidOn: new Date().toISOString(),
    sanitizedResponse: { test: true },
    ...overrides,
  };
}

async function createTestOrder(totalNaira = 26_500) {
  const totals = calculateOrderTotal({
    items: [{ unitPriceKobo: totalNaira * 100, quantity: 1 }],
  });
  const reference = generateOrderReference();
  const order = await prisma.order.create({
    data: {
      reference,
      merchantId,
      customerId,
      state: "PAYMENT_PENDING",
      subtotalKobo: totals.subtotalKobo,
      totalKobo: totals.totalKobo,
      confirmedAt: new Date(),
      items: {
        create: [
          {
            productNameSnapshot: "Test Item",
            unitPriceKoboSnapshot: totals.subtotalKobo,
            quantity: 1,
            lineTotalKobo: totals.subtotalKobo,
          },
        ],
      },
      payment: {
        create: {
          provider: "MONNIFY",
          state: "PENDING",
          invoiceReference: generateInvoiceReference(reference, 1),
          expectedAmountKobo: totals.totalKobo,
        },
      },
    },
    include: { payment: true },
  });
  return order;
}

beforeAll(async () => {
  const merchant = await prisma.merchant.create({
    data: {
      name: "Test Merchant",
      slug: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      email: "test@example.com",
    },
  });
  merchantId = merchant.id;
  const customer = await prisma.customer.create({
    data: {
      merchantId,
      waId: `test-${Date.now()}`,
      phoneNumber: "+2340000000000",
    },
  });
  customerId = customer.id;
});

afterAll(async () => {
  // No $disconnect here — the client is shared across test files.
  await prisma.merchant.delete({ where: { id: merchantId } }).catch(() => {});
});

describe("verified transaction application", () => {
  it("marks PAID and issues exactly one receipt on exact payment", async () => {
    const order = await createTestOrder();
    const result = await applyVerifiedTransaction(
      order.payment!.id,
      verified({})
    );
    expect(result.paymentState).toBe("PAID");
    expect(result.transitionedToPaid).toBe(true);
    expect(result.receiptToken).toBeTruthy();

    const updated = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { receipt: true, payment: true },
    });
    expect(updated.state).toBe("PAID");
    expect(updated.paidAt).not.toBeNull();
    expect(updated.receipt).not.toBeNull();
    expect(updated.payment?.verifiedAt).not.toBeNull();
  });

  it("re-applying the same verified state never duplicates the receipt (idempotent webhooks)", async () => {
    const order = await createTestOrder();
    const v = verified({});
    const first = await applyVerifiedTransaction(order.payment!.id, v);
    const second = await applyVerifiedTransaction(order.payment!.id, v);
    expect(first.transitionedToPaid).toBe(true);
    expect(second.transitionedToPaid).toBe(false);

    const receipts = await prisma.receipt.findMany({
      where: { orderId: order.id },
    });
    expect(receipts).toHaveLength(1);
  });

  it("underpayment becomes PARTIALLY_PAID and the order is NOT fulfilled", async () => {
    const order = await createTestOrder();
    const result = await applyVerifiedTransaction(
      order.payment!.id,
      verified({ amountPaidNaira: 10_000 })
    );
    expect(result.paymentState).toBe("PARTIALLY_PAID");
    expect(result.transitionedToPaid).toBe(false);

    const updated = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { receipt: true },
    });
    expect(updated.state).toBe("NEEDS_ATTENTION");
    expect(updated.paidAt).toBeNull();
    expect(updated.receipt).toBeNull();
  });

  it("overpayment is flagged OVERPAID with the excess preserved", async () => {
    const order = await createTestOrder();
    const result = await applyVerifiedTransaction(
      order.payment!.id,
      verified({ amountPaidNaira: 30_000 })
    );
    expect(result.paymentState).toBe("OVERPAID");
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { orderId: order.id },
    });
    expect(payment.paidAmountKobo).toBe(3_000_000); // full excess preserved
    const updated = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updated.state).toBe("NEEDS_ATTENTION");
  });

  it("a PAID payment is final — later FAILED events cannot downgrade it", async () => {
    const order = await createTestOrder();
    await applyVerifiedTransaction(order.payment!.id, verified({}));
    const after = await applyVerifiedTransaction(
      order.payment!.id,
      verified({ paymentStatus: "FAILED", amountPaidNaira: 0 })
    );
    expect(after.paymentState).toBe("PAID");
    const updated = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updated.state).toBe("PAID");
  });

  it("rejects non-NGN currencies", async () => {
    const order = await createTestOrder();
    await expect(
      applyVerifiedTransaction(
        order.payment!.id,
        verified({ currencyCode: "USD" })
      )
    ).rejects.toThrow(/currency/);
  });

  it("expired invoices go EXPIRED; a retry gets a brand-new reference", async () => {
    const order = await createTestOrder();
    await applyVerifiedTransaction(
      order.payment!.id,
      verified({ paymentStatus: "EXPIRED", amountPaidNaira: 0 })
    );
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { orderId: order.id },
    });
    expect(payment.state).toBe("EXPIRED");

    const fresh = generateInvoiceReference(order.reference, payment.attempt + 1);
    expect(fresh).not.toBe(payment.invoiceReference);
  });
});

describe("paid order immutability", () => {
  it("order items keep their snapshots and totals after payment", async () => {
    const order = await createTestOrder();
    await applyVerifiedTransaction(order.payment!.id, verified({}));
    const items = await prisma.orderItem.findMany({
      where: { orderId: order.id },
    });
    expect(items[0]?.unitPriceKoboSnapshot).toBe(2_650_000);
    expect(items[0]?.productNameSnapshot).toBe("Test Item");
    // The application refuses to create a replacement invoice for PAID orders
    // (createPaymentForOrder throws) — enforced in payments/service.ts.
  });
});

describe("tenant isolation", () => {
  it("orders are invisible to another merchant's scoped queries", async () => {
    const order = await createTestOrder();
    const otherMerchant = await prisma.merchant.create({
      data: {
        name: "Other",
        slug: `other-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        email: "other@example.com",
      },
    });
    try {
      const crossTenant = await prisma.order.findFirst({
        where: { id: order.id, merchantId: otherMerchant.id },
      });
      expect(crossTenant).toBeNull();
      const scoped = await prisma.order.findFirst({
        where: { id: order.id, merchantId },
      });
      expect(scoped).not.toBeNull();
    } finally {
      await prisma.merchant.delete({ where: { id: otherMerchant.id } });
    }
  });
});
