import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import type { ParsedInboundMessage } from "@/lib/whatsapp/types";
import type { OrderIntent } from "@/lib/ai/schema";

/**
 * Conversation-engine integration tests. WhatsApp sends and the NVIDIA call
 * are mocked; the database, matching, money and payment logic are real.
 * DEMO_MODE payment creation avoids network while keeping the flow intact.
 */

const outboundLog: Array<{ kind: string; text: string }> = [];

vi.mock("@/lib/orders/outbound", () => ({
  sendToCustomer: vi.fn(async (input: { kind: string; text: string }) => {
    outboundLog.push({ kind: input.kind, text: input.text });
    return `mock-${Math.random().toString(36).slice(2)}`;
  }),
}));

let nextIntent: OrderIntent | null = null;
vi.mock("@/lib/ai/nvidia", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/ai/nvidia")>();
  return {
    ...original,
    extractOrderIntent: vi.fn(async (message: string) => {
      if (nextIntent) return { intent: nextIntent, source: "nvidia" as const };
      const { fallbackExtract } = await import("@/lib/ai/fallback");
      return { intent: fallbackExtract(message), source: "fallback" as const };
    }),
  };
});

let merchantId: string;
let messageCounter = 0;

function inbound(
  text: string,
  opts: { id?: string; interactiveId?: string } = {}
): ParsedInboundMessage {
  messageCounter += 1;
  return {
    providerMessageId: opts.id ?? `wamid.ENGINE-${Date.now()}-${messageCounter}`,
    from: "2348011112222",
    profileName: "Engine Tester",
    timestamp: new Date(),
    kind: opts.interactiveId ? "button_reply" : "text",
    text: opts.interactiveId ? null : text,
    interactiveId: opts.interactiveId ?? null,
    location: null,
    flowResponse: null,
    rawType: opts.interactiveId ? "interactive" : "text",
  };
}

beforeAll(async () => {
  process.env.DEMO_MODE = "true"; // payment creation uses the demo path (no network)
  resetEnvCache();

  const merchant = await prisma.merchant.create({
    data: {
      name: "Engine Test Shop",
      slug: `engine-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      storeCode: `ENG${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
      email: "engine@example.com",
    },
  });
  merchantId = merchant.id;

  // Multi-merchant routing: point both test customers' WhatsApp sessions at
  // this store so scoped conversation flows run directly.
  for (const waId of ["2348011112222", "2348022223333"]) {
    await prisma.waSession.upsert({
      where: { waId },
      update: { activeMerchantId: merchant.id },
      create: { waId, activeMerchantId: merchant.id },
    });
  }

  const polo = await prisma.product.create({
    data: {
      merchantId,
      name: "Classic Polo Shirt",
      priceKobo: 1_200_000,
      aliases: ["polo", "polo shirt", "classic polo"],
      stockQuantity: 50,
      active: true,
    },
  });
  for (const colour of ["Black", "White"]) {
    for (const size of ["M", "L"]) {
      await prisma.productVariant.create({
        data: { productId: polo.id, colour, size, stockQuantity: 10 },
      });
    }
  }
  await prisma.deliveryZone.create({
    data: {
      merchantId,
      name: "Yaba",
      aliases: ["yaba", "akoka"],
      feeKobo: 250_000,
      active: true,
    },
  });
});

afterAll(async () => {
  process.env.DEMO_MODE = "false";
  resetEnvCache();
  // No $disconnect here — the client is shared across test files.
  await prisma.waSession
    .deleteMany({ where: { waId: { in: ["2348011112222", "2348022223333", "2348033334444"] } } })
    .catch(() => {});
  await prisma.merchant.delete({ where: { id: merchantId } }).catch(() => {});
});

describe("conversation engine", () => {
  it("builds a fully matched draft and sends the NGN 26,500 summary", async () => {
    const { processInboundMessage } = await import("@/lib/orders/engine");
    nextIntent = {
      merchantCode: null,
      intent: "PLACE_ORDER",
      items: [{ searchTerm: "polo", quantity: 2, size: "large", colour: "black" }],
      deliveryMethod: "DELIVERY",
      deliveryAddress: null,
      deliveryArea: "Yaba",
      customerName: null,
      notes: null,
      missingFields: [],
    };
    outboundLog.length = 0;
    await processInboundMessage(
      inbound("I need two black polo shirts, large size, delivered to Yaba.")
    );
    nextIntent = null;

    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { merchantId, customer: { waId: "2348011112222" } },
    });
    expect(conversation.state).toBe("AWAITING_CONFIRMATION");

    const summary = outboundLog.at(-1);
    expect(summary?.kind).toBe("buttons");
    expect(summary?.text).toContain("2 × Classic Polo Shirt");
    expect(summary?.text).toContain("NGN 24,000");
    expect(summary?.text).toContain("NGN 2,500");
    expect(summary?.text).toContain("NGN 26,500");
  });

  it("confirms the order once — a duplicate webhook delivery creates no second order", async () => {
    const { processInboundMessage } = await import("@/lib/orders/engine");
    const confirm = inbound("", { interactiveId: "confirm_order" });

    await processInboundMessage(confirm);
    // Same provider message id delivered again (Meta retry):
    await processInboundMessage(confirm);

    const orders = await prisma.order.findMany({ where: { merchantId } });
    expect(orders).toHaveLength(1);
    const order = orders[0]!;
    expect(order.state).toBe("PAYMENT_PENDING");
    expect(order.totalKobo).toBe(2_650_000);
    expect(order.subtotalKobo).toBe(2_400_000);
    expect(order.deliveryFeeKobo).toBe(250_000);

    const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    expect(items).toHaveLength(1);
    expect(items[0]?.productNameSnapshot).toBe("Classic Polo Shirt");
    expect(items[0]?.unitPriceKoboSnapshot).toBe(1_200_000);
    expect(items[0]?.variantSnapshot).toBe("Black / L");

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { orderId: order.id },
    });
    expect(payment.provider).toBe("DEMO"); // demo mode — no real Monnify call
    expect(payment.state).toBe("PENDING");
  });

  it("an invented product is rejected: no order line, a clarification is asked", async () => {
    const { processInboundMessage } = await import("@/lib/orders/engine");
    nextIntent = {
      merchantCode: null,
      intent: "PLACE_ORDER",
      items: [{ searchTerm: "gold wristwatch", quantity: 1, size: null, colour: null }],
      deliveryMethod: null,
      deliveryAddress: null,
      deliveryArea: null,
      customerName: null,
      notes: null,
      missingFields: [],
    };
    outboundLog.length = 0;
    await processInboundMessage(inbound("one gold wristwatch"));
    nextIntent = null;

    const reply = outboundLog.at(-1);
    expect(reply?.text).toContain("couldn't find");
    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { merchantId, customer: { waId: "2348011112222" } },
    });
    expect(conversation.state).toBe("NEEDS_CLARIFICATION");
    // Still exactly one order (from the earlier test) — nothing invented.
    expect(await prisma.order.count({ where: { merchantId } })).toBe(1);
  });

  it("START <code> selects a store and catalogues never mix", async () => {
    const { processInboundMessage } = await import("@/lib/orders/engine");
    const waId = "2348033334444";
    const otherStoreCode = `OTH${Date.now().toString(36).toUpperCase()}`;
    const other = await prisma.merchant.create({
      data: {
        name: "Other Gadget Shop",
        slug: `other-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        storeCode: otherStoreCode,
        email: "other@example.com",
      },
    });
    await prisma.product.create({
      data: {
        merchantId: other.id,
        name: "Gadget Gizmo",
        priceKobo: 900_000,
        aliases: ["gadget", "gizmo"],
        stockQuantity: 5,
        active: true,
      },
    });

    try {
      // Deterministic selection — no session existed for this number.
      await processInboundMessage({
        providerMessageId: `wamid.STORE-${Date.now()}`,
        from: waId,
        profileName: "Switcher",
        timestamp: new Date(),
        kind: "text",
        text: `START ${otherStoreCode}`,
        interactiveId: null,
        location: null,
        flowResponse: null,
        rawType: "text",
      });
      const session = await prisma.waSession.findUniqueOrThrow({
        where: { waId },
      });
      expect(session.activeMerchantId).toBe(other.id);

      // The engine-shop's polo is NOT in this store's catalogue: asking for
      // it must clarify, never leak the other merchant's product or price.
      nextIntent = {
        merchantCode: null,
        intent: "PLACE_ORDER",
        items: [{ searchTerm: "polo", quantity: 1, size: null, colour: null }],
        deliveryMethod: null,
        deliveryAddress: null,
        deliveryArea: null,
        customerName: null,
        notes: null,
        missingFields: [],
      };
      outboundLog.length = 0;
      await processInboundMessage({
        providerMessageId: `wamid.STORE2-${Date.now()}`,
        from: waId,
        profileName: "Switcher",
        timestamp: new Date(),
        kind: "text",
        text: "one polo please",
        interactiveId: null,
        location: null,
        flowResponse: null,
        rawType: "text",
      });
      nextIntent = null;
      const reply = outboundLog.at(-1);
      expect(reply?.text).toContain("couldn't find");
      expect(reply?.text).not.toContain("Classic Polo Shirt");
      expect(await prisma.order.count({ where: { merchantId: other.id } })).toBe(0);
    } finally {
      await prisma.merchant.delete({ where: { id: other.id } }).catch(() => {});
    }
  });

  it("deterministic 'human' command hands the chat over without AI", async () => {
    const { processInboundMessage } = await import("@/lib/orders/engine");
    await processInboundMessage(inbound("human"));
    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { merchantId, customer: { waId: "2348011112222" } },
    });
    expect(conversation.automationMode).toBe("HUMAN");
    expect(conversation.state).toBe("HUMAN_REQUIRED");
  });

  it("prefills delivery from an onboarded customer's saved profile", async () => {
    const { processInboundMessage } = await import("@/lib/orders/engine");
    const waId = "2348022223333";
    await prisma.customer.create({
      data: {
        merchantId,
        waId,
        phoneNumber: waId,
        name: "Onboarded Ada",
        defaultAddress: "5 Test Close, Yaba",
      },
    });
    nextIntent = {
      merchantCode: null,
      intent: "PLACE_ORDER",
      items: [{ searchTerm: "polo", quantity: 1, size: "M", colour: "white" }],
      deliveryMethod: null,
      deliveryAddress: null,
      deliveryArea: null,
      customerName: null,
      notes: null,
      missingFields: [],
    };
    outboundLog.length = 0;
    await processInboundMessage({
      providerMessageId: `wamid.PREFILL-${Date.now()}`,
      from: waId,
      profileName: "WhatsApp Display Name",
      timestamp: new Date(),
      kind: "text",
      text: "one white polo size M",
      interactiveId: null,
      location: null,
      flowResponse: null,
      rawType: "text",
    });
    nextIntent = null;

    // Straight to the confirmation summary — no delivery question asked.
    const summary = outboundLog.at(-1);
    expect(summary?.kind).toBe("buttons");
    expect(summary?.text).toContain("Yaba");
    expect(summary?.text).toContain("5 Test Close");

    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { merchantId, customer: { waId } },
    });
    expect(conversation.state).toBe("AWAITING_CONFIRMATION");

    // The onboarding name survives the WhatsApp profile name.
    const customer = await prisma.customer.findFirstOrThrow({
      where: { merchantId, waId },
    });
    expect(customer.name).toBe("Onboarded Ada");
  });

  it("the bot stays silent while a human is active", async () => {
    const { processInboundMessage } = await import("@/lib/orders/engine");
    outboundLog.length = 0;
    await processInboundMessage(inbound("hello, anyone there?"));
    expect(outboundLog).toHaveLength(0);
    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { merchantId, customer: { waId: "2348011112222" } },
    });
    expect(conversation.state).toBe("HUMAN_ACTIVE");
  });

  it("a catalogue selection auto-resumes a stuck HUMAN conversation (no dead-end)", async () => {
    const { processInboundMessage } = await import("@/lib/orders/engine");
    // The conversation is HUMAN from the previous test. A forwarded catalogue
    // order (rawType interactive.*) must resume automation and reply.
    nextIntent = {
      merchantCode: null,
      intent: "PLACE_ORDER",
      items: [{ searchTerm: "polo", quantity: 1, size: "M", colour: "black" }],
      deliveryMethod: "DELIVERY",
      deliveryAddress: null,
      deliveryArea: "Yaba",
      customerName: null,
      notes: null,
      missingFields: [],
    };
    outboundLog.length = 0;
    await processInboundMessage({
      providerMessageId: `wamid.RESUME-${Date.now()}`,
      from: "2348011112222",
      profileName: "Engine Tester",
      timestamp: new Date(),
      kind: "text",
      text: "I want 1 Classic Polo Shirt",
      interactiveId: null,
      location: null,
      flowResponse: null,
      rawType: "interactive.product_selection",
    });
    nextIntent = null;

    expect(outboundLog.length).toBeGreaterThan(0); // the bot responded
    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { merchantId, customer: { waId: "2348011112222" } },
    });
    expect(conversation.automationMode).toBe("AUTO");
  });
});

describe("reconciliation", () => {
  it("recovers a payment whose webhook was missed", async () => {
    const client = await import("@/lib/monnify/client");
    const spy = vi.spyOn(client, "verifyTransaction").mockResolvedValue({
      paymentStatus: "PAID",
      amountPaidNaira: 5_000,
      totalPayableNaira: 5_000,
      currencyCode: "NGN",
      paymentMethod: "ACCOUNT_TRANSFER",
      transactionReference: "MNFY-RECON-1",
      paymentReference: null,
      paidOn: new Date().toISOString(),
      sanitizedResponse: {},
    });

    const customer = await prisma.customer.create({
      data: {
        merchantId,
        waId: `recon-${Date.now()}`,
        phoneNumber: "+2340000000001",
      },
    });
    const order = await prisma.order.create({
      data: {
        reference: `CFY-RECON${Date.now().toString(36).toUpperCase().slice(-4)}`,
        merchantId,
        customerId: customer.id,
        state: "PAYMENT_PENDING",
        subtotalKobo: 500_000,
        totalKobo: 500_000,
        items: {
          create: [
            {
              productNameSnapshot: "Recon Item",
              unitPriceKoboSnapshot: 500_000,
              quantity: 1,
              lineTotalKobo: 500_000,
            },
          ],
        },
        payment: {
          create: {
            provider: "MONNIFY",
            state: "PENDING",
            invoiceReference: `RECON-${Date.now()}`,
            transactionReference: "MNFY-RECON-1",
            expectedAmountKobo: 500_000,
          },
        },
      },
      include: { payment: true },
    });
    // Backdate so it looks stale.
    await prisma.$executeRaw`UPDATE "Payment" SET "updatedAt" = NOW() - INTERVAL '30 minutes' WHERE "id" = ${order.payment!.id}`;

    const { reconcilePendingPayments } = await import("@/lib/payments/service");
    const result = await reconcilePendingPayments(5);
    expect(result.transitioned).toBeGreaterThanOrEqual(1);

    const updated = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { receipt: true, payment: true },
    });
    expect(updated.state).toBe("PAID");
    expect(updated.payment?.state).toBe("PAID");
    expect(updated.receipt).not.toBeNull();
    spy.mockRestore();
  });
});
