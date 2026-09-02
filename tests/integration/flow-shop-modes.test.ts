import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { buildShopScreen } from "@/lib/whatsapp/flow-screens";
import { resolveFlowScreen } from "@/lib/whatsapp/flow-screens";
import {
  createFlowSession,
  getValidFlowSession,
} from "@/lib/whatsapp/flow-session";

/**
 * Exercises the new SHOP mode-machine against the real database so we catch a
 * data-model or image mismatch before switching production to the v2 Flow.
 */

const REQUIRED_SHOP_FIELDS = [
  "store_name",
  "footer_label",
  "show_product",
  "show_cart",
  "show_cart_hint",
  "show_products",
  "show_product_image",
  "show_sizes",
  "show_colours",
  "has_error",
  "error_message",
  "has_cart",
  "cart_hint",
  "has_products",
  "products",
  "product_name",
  "product_price",
  "product_description",
  "product_image",
  "quantities",
  "sizes",
  "colours",
  "cart_lines",
  "cart_total",
];

beforeAll(async () => {
  for (let i = 0; i < 8; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}, 60_000);

describe("SHOP mode-machine (real DB)", () => {
  it("renders every declared SHOP field across catalogue → product → cart", async () => {
    const merchant = await prisma.merchant.findFirst({
      where: {
        active: true,
        products: { some: { active: true, stockQuantity: { gt: 0 } } },
      },
      select: { id: true, name: true },
    });
    expect(merchant, "need a merchant with in-stock products").toBeTruthy();
    if (!merchant) return;

    // --- Catalogue -------------------------------------------------------
    const catalogue = await buildShopScreen(merchant.id, {});
    expect(catalogue.screen).toBe("SHOP");
    for (const field of REQUIRED_SHOP_FIELDS) {
      expect(catalogue.data, `catalogue missing ${field}`).toHaveProperty(field);
    }
    expect(catalogue.data.show_products).toBe(true);
    const products = catalogue.data.products as Array<{
      id: string;
      title: string;
      image?: string;
    }>;
    expect(products.length).toBeGreaterThan(0);
    const withImages = products.filter((p) => p.image).length;
    const size = Buffer.byteLength(JSON.stringify(catalogue.data));
    console.log(
      `catalogue: ${products.length} products, ${withImages} with images, ${(size / 1024).toFixed(0)} KiB`
    );
    expect(size).toBeLessThan(10_000_000);

    // --- Session so the endpoint can drive product/cart ------------------
    const { token } = await createFlowSession({
      waId: "000000000000",
      merchantId: merchant.id,
      state: { merchantId: merchant.id, storeName: merchant.name, shopMode: "catalogue" },
      currentScreen: "SHOP",
    });

    // --- Product ("Customize") view --------------------------------------
    let session = await getValidFlowSession(token);
    expect(session).toBeTruthy();
    const productView = await resolveFlowScreen({
      action: "data_exchange",
      screen: "SHOP",
      data: { product_pick: products[0]!.id },
      flowToken: token,
      session: session!,
    });
    expect(productView.screen).toBe("SHOP");
    expect(productView.data.show_product).toBe(true);
    expect(productView.data.product_name).toBeTruthy();
    console.log(
      `product: "${productView.data.product_name}" ${productView.data.product_price}, image=${Boolean(
        productView.data.show_product_image
      )}, sizes=${(productView.data.sizes as unknown[]).length}, colours=${(productView.data.colours as unknown[]).length}`
    );

    // --- Add to cart -> cart view ----------------------------------------
    session = await getValidFlowSession(token);
    const sizes = productView.data.sizes as Array<{ id: string }>;
    const colours = productView.data.colours as Array<{ id: string }>;
    const cartView = await resolveFlowScreen({
      action: "data_exchange",
      screen: "SHOP",
      data: {
        quantity: "1",
        ...(sizes.length ? { size: sizes[0]!.id } : {}),
        ...(colours.length ? { colour: colours[0]!.id } : {}),
      },
      flowToken: token,
      session: session!,
    });
    expect(cartView.screen).toBe("SHOP");
    expect(cartView.data.show_cart).toBe(true);
    expect(String(cartView.data.cart_total)).toMatch(/Subtotal:.*\d/);
    console.log(`cart: ${JSON.stringify(cartView.data.cart_lines)} / ${cartView.data.cart_total}`);

    // --- Checkout advances to DELIVERY -----------------------------------
    session = await getValidFlowSession(token);
    const delivery = await resolveFlowScreen({
      action: "data_exchange",
      screen: "SHOP",
      data: { cart_action: "checkout" },
      flowToken: token,
      session: session!,
    });
    expect(delivery.screen).toBe("DELIVERY");

    await prisma.whatsAppFlowSession.deleteMany({ where: { waId: "000000000000" } });
  }, 60_000);
});
