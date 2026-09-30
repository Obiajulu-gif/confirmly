import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { WhatsAppFlowSession } from "@prisma/client";
import flowJson from "@/flows/order-flow.json";

const { prisma } = vi.hoisted(() => {
  // This repo shares a module registry across files. Reload dependencies so
  // these DB mocks work even if the endpoint tests imported the resolver first.
  vi.resetModules();
  return {
    prisma: {
      merchant: { findMany: vi.fn(), findFirst: vi.fn() },
      merchantImageAsset: { findUnique: vi.fn() },
      product: { count: vi.fn(), findMany: vi.fn() },
      productImageAsset: { findUnique: vi.fn() },
      customer: { findFirst: vi.fn(), upsert: vi.fn() },
      conversation: { upsert: vi.fn() },
      whatsAppFlowSession: { update: vi.fn() },
    },
  };
});
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/whatsapp/flow-order", () => ({ finalizeFlowOrder: vi.fn() }));

import { recoveryScreen, resolveFlowScreen } from "@/lib/whatsapp/flow-screens";
import { getStoreLogoBase64 } from "@/lib/store-logo";
import { productImageBase64 } from "@/lib/whatsapp/flow-media";
import * as fonts from "@/lib/receipts/fonts";

const session = {
  id: "session-store-picker",
  waId: "000000000000",
  currentScreen: "START",
  state: {},
} as WhatsAppFlowSession;

async function resolve(screen: string, data: Record<string, unknown> = {}) {
  return resolveFlowScreen({
    action: "data_exchange",
    screen,
    data,
    session,
    flowToken: "test-flow-token",
  });
}

type StoreRow = {
  id: string;
  title: string;
  description: string;
  image: string;
  "alt-text": string;
};

async function expectDecodableImage(base64: string) {
  const bytes = Buffer.from(base64, "base64");
  expect(bytes.length).toBeGreaterThan(0);
  expect(bytes.length).toBeLessThan(100_000);
  // metadata() alone accepts the old corrupt PNG. Decode the pixel data too.
  await expect(sharp(bytes).raw().toBuffer()).resolves.toBeInstanceOf(Buffer);
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.merchant.findMany.mockResolvedValue([]);
  prisma.merchantImageAsset.findUnique.mockResolvedValue(null);
  prisma.productImageAsset.findUnique.mockResolvedValue(null);
  prisma.customer.findFirst.mockResolvedValue({ id: "returning-customer" });
  prisma.customer.upsert.mockResolvedValue({ id: "customer" });
  prisma.conversation.upsert.mockResolvedValue({ id: "conversation" });
  prisma.whatsAppFlowSession.update.mockResolvedValue(session);
});

afterEach(() => vi.restoreAllMocks());
afterAll(() => vi.resetModules());

describe("native WhatsApp store picker", () => {
  it("returns an empty store list with a message when no stores are available", async () => {
    const response = await resolve("START");
    expect(response.screen).toBe("SEARCH");
    expect(response.data.has_stores).toBe(false);
    expect(response.data.stores).toEqual([]);
    expect(typeof response.data.empty_message).toBe("string");
    expect((response.data.empty_message as string).length).toBeGreaterThan(0);
  });

  it("recovers SEARCH with an empty list and the error message", async () => {
    const response = recoveryScreen("SEARCH", "Sorry, something went wrong. Please try again.");
    expect(response.data.has_stores).toBe(false);
    expect(response.data.stores).toEqual([]);
    expect(response.data.empty_message).toBe("Sorry, something went wrong. Please try again.");
  });

  it("renders store cards and opens the selected store's catalogue", async () => {
    prisma.merchant.findMany.mockResolvedValue([
      { id: "store-ada", name: "Ada Kitchen", category: "Food", storeCode: "ADA" },
    ]);
    const picker = await resolve("START");
    expect(picker.data.has_stores).toBe(true);
    const row = (picker.data.stores as StoreRow[])[0]!;
    expect(row.id).toBe("store-ada");
    expect(row.title).toBe("Ada Kitchen");
    await expectDecodableImage(row.image);

    prisma.merchant.findFirst.mockResolvedValue({ id: "store-ada", name: "Ada Kitchen" });
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([
      { id: "p-rice", name: "Jollof rice", category: "Meals", priceKobo: 150000 },
    ]);
    const catalogue = await resolve("SEARCH", { store_id: row.id });
    expect(catalogue.screen).toBe("SHOP");
    expect(catalogue.data.store_name).toBe("Ada Kitchen");
    expect(catalogue.data.products).toEqual([
      expect.objectContaining({ id: "p-rice", title: "Jollof rice" }),
    ]);
    const schema = flowJson.screens.find((screen) => screen.id === "SHOP")!.data!;
    expect(Object.keys(catalogue.data).sort()).toEqual(Object.keys(schema).sort());
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { merchantId: "store-ada", active: true, stockQuantity: { gt: 0 } } })
    );
  });

  it("uses a valid image even if the logo table and initials renderer fail", async () => {
    prisma.merchantImageAsset.findUnique.mockRejectedValueOnce(new Error("logo table unavailable"));
    vi.spyOn(fonts, "getReceiptFonts").mockImplementationOnce(() => { throw new Error("font unavailable"); });
    await expectDecodableImage(await getStoreLogoBase64({ id: "store-fallback", name: "Fallback" }));
  });

  it("never sends an undecodable original product image to WhatsApp", async () => {
    prisma.productImageAsset.findUnique.mockResolvedValueOnce({ bytes: Buffer.from("not an image") });
    expect(await productImageBase64("product-corrupt", "thumb")).toBeNull();
  });

  it("ships a decodable example image in the generated Flow JSON", async () => {
    const picker = flowJson.screens.find((screen) => screen.id === "SEARCH")!;
    const example = picker.data!.stores!.__example__[0]!;
    await expectDecodableImage(example.image);
  });

  it("falls back even when the native image module cannot be imported", async () => {
    vi.resetModules();
    vi.doMock("sharp", () => { throw new Error("native module unavailable"); });
    try {
      const logos = await import("@/lib/store-logo");
      await expectDecodableImage(await logos.getStoreLogoBase64({
        id: "store-no-native-module", name: "No native module",
      }));
    } finally {
      vi.doUnmock("sharp");
      vi.resetModules();
    }
  });

  it.each(["START", "ONBOARDING", "SHOP", "DELIVERY", "REVIEW"])(
    "recovers on %s with every field its Flow JSON declares",
    (id) => {
      const response = recoveryScreen(id, "Please try again.");
      const screen = flowJson.screens.find((screen) => screen.id === id)!;
      expect(response.screen).toBe(id);
      const schema = (screen.data ?? {}) as Record<string, { type: string }>;
      expect(Object.keys(response.data).sort()).toEqual(Object.keys(schema).sort());
      for (const [key, field] of Object.entries(schema)) {
        if (field.type === "array") expect(Array.isArray(response.data[key])).toBe(true);
        else expect(typeof response.data[key]).toBe(field.type);
      }
    }
  );
});
