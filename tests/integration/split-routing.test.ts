import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { calculateOrderTotal } from "@/lib/money";
import { generateOrderReference } from "@/lib/references";
import * as monnifyClient from "@/lib/monnify/client";
import type { CreatePaymentInput } from "@/lib/monnify/client";

/**
 * Merchant-routed checkout: the subaccount code is loaded server-side from
 * the ORDER-OWNED merchant payment profile. Monnify's createPayment is
 * mocked to capture exactly what would be sent.
 */

const captured: CreatePaymentInput[] = [];
// spyOn (not vi.mock): with a shared module registry the payments service is
// already bound to the real client module — the spy swaps the live export.
let createPaymentSpy: { mockRestore: () => void } | null = null;

let merchantA: string;
let merchantB: string;
let customerA: string;
let customerB: string;
const SUB_CODE = `SUB_TEST_${Date.now().toString(36).toUpperCase()}`;

async function makeOrder(merchantId: string, customerId: string) {
  const totals = calculateOrderTotal({
    items: [{ unitPriceKobo: 1_000_000, quantity: 1 }],
  });
  return prisma.order.create({
    data: {
      reference: generateOrderReference(),
      merchantId,
      customerId,
      state: "CONFIRMED",
      subtotalKobo: totals.subtotalKobo,
      totalKobo: totals.totalKobo,
      confirmedAt: new Date(),
      items: {
        create: [
          {
            productNameSnapshot: "Split Item",
            unitPriceKoboSnapshot: 1_000_000,
            quantity: 1,
            lineTotalKobo: 1_000_000,
          },
        ],
      },
    },
  });
}

beforeAll(async () => {
  process.env.MONNIFY_SUBACCOUNT_ENABLED = "true";
  process.env.DEMO_MODE = "false";
  resetEnvCache();

  createPaymentSpy = vi
    .spyOn(monnifyClient, "createPayment")
    .mockImplementation(async (input: CreatePaymentInput) => {
      captured.push(input);
      return {
        mode: "transaction" as const,
        checkoutUrl: "https://sandbox.monnify.com/checkout/mock",
        transactionReference: `MNFY-MOCK-${Math.random().toString(36).slice(2)}`,
        virtualAccount: null,
        sanitizedResponse: { mode: "transaction", mocked: true },
      };
    });

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const a = await prisma.merchant.create({
    data: {
      name: "Split Shop A",
      slug: `split-a-${suffix}`,
      storeCode: `SPA${suffix.toUpperCase().slice(0, 8)}`,
      email: "a@example.com",
    },
  });
  const b = await prisma.merchant.create({
    data: {
      name: "Split Shop B",
      slug: `split-b-${suffix}`,
      storeCode: `SPB${suffix.toUpperCase().slice(0, 8)}`,
      email: "b@example.com",
    },
  });
  merchantA = a.id;
  merchantB = b.id;

  // Merchant A has an ACTIVE settlement profile with a subaccount.
  await prisma.merchantPaymentProfile.create({
    data: {
      merchantId: merchantA,
      bankCode: "058",
      bankName: "Guaranty Trust Bank",
      accountNumberEnc: "test-ciphertext",
      accountNumberMasked: "******1234",
      accountName: "SPLIT SHOP A LTD",
      validationStatus: "VALIDATED",
      subAccountCode: SUB_CODE,
      subaccountStatus: "ACTIVE",
      splitPercentage: 100,
      active: true,
    },
  });
  // Merchant B has no active profile at all.

  const ca = await prisma.customer.create({
    data: { merchantId: merchantA, waId: `splita-${suffix}`, phoneNumber: "1" },
  });
  const cb = await prisma.customer.create({
    data: { merchantId: merchantB, waId: `splitb-${suffix}`, phoneNumber: "2" },
  });
  customerA = ca.id;
  customerB = cb.id;
});

afterAll(async () => {
  process.env.MONNIFY_SUBACCOUNT_ENABLED = "false";
  resetEnvCache();
  createPaymentSpy?.mockRestore();
  await prisma.merchant.deleteMany({
    where: { id: { in: [merchantA, merchantB] } },
  });
});

describe("merchant-routed checkout", () => {
  it("attaches the order-owned merchant's subaccount with a 100 percent split", async () => {
    const { createPaymentForOrder } = await import("@/lib/payments/service");
    const order = await makeOrder(merchantA, customerA);
    captured.length = 0;

    const { payment } = await createPaymentForOrder(order.id);

    expect(captured).toHaveLength(1);
    const sent = captured[0]!;
    expect(sent.incomeSplitConfig).toBeDefined();
    expect(sent.incomeSplitConfig).toHaveLength(1);
    expect(sent.incomeSplitConfig![0]).toMatchObject({
      subAccountCode: SUB_CODE,
      splitPercentage: 100,
      feeBearer: true,
      feePercentage: 100,
    });

    // Snapshot persisted on the Payment row.
    expect(payment.subAccountCodeSnapshot).toBe(SUB_CODE);
    expect(payment.splitPercentageSnapshot).toBe(100);
    expect(payment.routedToPlatform).toBe(false);
  });

  it("blocks checkout when the order's merchant has no active subaccount", async () => {
    const { createPaymentForOrder, CheckoutBlockedError } = await import(
      "@/lib/payments/service"
    );
    const order = await makeOrder(merchantB, customerB);
    captured.length = 0;

    await expect(createPaymentForOrder(order.id)).rejects.toThrow(
      CheckoutBlockedError
    );
    // Never silently routed to the platform account and never sent without
    // the split.
    expect(captured).toHaveLength(0);
  });

  it("merchant B's order can never carry merchant A's subaccount code", async () => {
    // Structural proof: the profile lookup is keyed by the order's own
    // merchantId. With A's profile present, B's checkout still has nothing
    // to attach — asserted by the block above — and A's code was only ever
    // captured on A's own order.
    const codes = captured.map((c) => c.incomeSplitConfig?.[0]?.subAccountCode);
    expect(codes).not.toContain(SUB_CODE);
  });

  it("platform fallback (feature disabled) is explicit, never silent", async () => {
    process.env.MONNIFY_SUBACCOUNT_ENABLED = "false";
    resetEnvCache();
    try {
      const { createPaymentForOrder } = await import("@/lib/payments/service");
      const order = await makeOrder(merchantB, customerB);
      captured.length = 0;
      const { payment } = await createPaymentForOrder(order.id);
      expect(captured[0]?.incomeSplitConfig).toBeUndefined();
      expect(payment.routedToPlatform).toBe(true); // visible warning flag
    } finally {
      process.env.MONNIFY_SUBACCOUNT_ENABLED = "true";
      resetEnvCache();
    }
  });
});
