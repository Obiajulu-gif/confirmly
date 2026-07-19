"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getMerchantSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { defer } from "@/lib/defer";
import { prewarmProductImages } from "@/lib/ai/product-image-prewarm";
import { nairaAmountToKobo } from "@/lib/money";

const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  category: z.string().trim().max(60).optional().or(z.literal("")),
  priceNaira: z.coerce.number().min(0).max(50_000_000),
  aliases: z.string().max(500).optional().or(z.literal("")),
  stockQuantity: z.coerce.number().int().min(0).max(1_000_000),
  variantSizes: z.string().max(300).optional().or(z.literal("")),
  variantColours: z.string().max(300).optional().or(z.literal("")),
});

export interface ProductFormState {
  error: string | null;
  ok: boolean;
  productId?: string;
}

function parseList(raw: string | undefined, max = 20): string[] {
  return [
    ...new Set(
      (raw ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ].slice(0, max);
}

function parseAliases(raw: string | undefined): string[] {
  return parseList(raw).map((item) => item.toLowerCase());
}

function buildVariants(input: {
  sizes: string[];
  colours: string[];
  stockQuantity: number;
}) {
  const sizes: Array<string | null> = input.sizes.length ? input.sizes : [null];
  const colours: Array<string | null> = input.colours.length
    ? input.colours
    : [null];
  if (
    sizes.length === 1 &&
    sizes[0] === null &&
    colours.length === 1 &&
    colours[0] === null
  ) {
    return [];
  }

  return colours.flatMap((colour) =>
    sizes.map((size) => ({
      size,
      colour,
      stockQuantity: input.stockQuantity,
      priceAdjustmentKobo: 0,
    }))
  );
}

function productData(data: z.infer<typeof productSchema>) {
  return {
    name: data.name,
    description: data.description || null,
    category: data.category || null,
    priceKobo: nairaAmountToKobo(data.priceNaira),
    aliases: parseAliases(data.aliases),
    stockQuantity: data.stockQuantity,
  };
}

export async function createProductAction(
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const session = await getMerchantSession();
  if (!session) return { error: "unauthorized", ok: false };
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "invalid input",
      ok: false,
    };
  }

  const data = parsed.data;
  const variants = buildVariants({
    sizes: parseList(data.variantSizes),
    colours: parseList(data.variantColours),
    stockQuantity: data.stockQuantity,
  });

  const product = await prisma.product.create({
    data: {
      merchantId: session.merchantId,
      ...productData(data),
      active: true,
      variants: variants.length ? { create: variants } : undefined,
    },
  });

  defer(() =>
    prewarmProductImages({
      merchantId: session.merchantId,
      productIds: [product.id],
      limit: 1,
      autoApprove: true,
      maxAttempts: 1,
      timeoutMs: 40_000,
      steps: 1,
      maxRuntimeMs: 50_000,
    }).then(() => undefined)
  );

  revalidatePath("/dashboard/products");
  return { error: null, ok: true, productId: product.id };
}

export async function updateProductAction(
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const session = await getMerchantSession();
  if (!session) return { error: "unauthorized", ok: false };
  const id = String(formData.get("id") ?? "");
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "invalid input",
      ok: false,
    };
  }

  const existing = await prisma.product.findFirst({
    where: { id, merchantId: session.merchantId },
    select: { id: true },
  });
  if (!existing) return { error: "product not found", ok: false };

  const data = parsed.data;
  const variants = buildVariants({
    sizes: parseList(data.variantSizes),
    colours: parseList(data.variantColours),
    stockQuantity: data.stockQuantity,
  });

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: productData(data),
    });
    await tx.productVariant.deleteMany({ where: { productId: id } });
    if (variants.length) {
      await tx.productVariant.createMany({
        data: variants.map((variant) => ({ productId: id, ...variant })),
      });
    }
  });

  defer(() =>
    prewarmProductImages({
      merchantId: session.merchantId,
      productIds: [id],
      limit: 1,
      autoApprove: true,
      maxAttempts: 1,
      timeoutMs: 40_000,
      steps: 1,
      maxRuntimeMs: 50_000,
    }).then(() => undefined)
  );

  revalidatePath("/dashboard/products");
  return { error: null, ok: true, productId: id };
}

export async function duplicateProductAction(formData: FormData): Promise<void> {
  const session = await getMerchantSession();
  if (!session) return;
  const id = String(formData.get("id") ?? "");
  const product = await prisma.product.findFirst({
    where: { id, merchantId: session.merchantId },
    include: { variants: true },
  });
  if (!product) return;

  await prisma.product.create({
    data: {
      merchantId: session.merchantId,
      name: `${product.name} Copy`.slice(0, 120),
      description: product.description,
      category: product.category,
      priceKobo: product.priceKobo,
      aliases: product.aliases,
      stockQuantity: product.stockQuantity,
      active: false,
      imageUrl:
        product.imageSource === "EXTERNAL_URL" ? product.imageUrl : null,
      imageSource:
        product.imageSource === "EXTERNAL_URL" ? "EXTERNAL_URL" : null,
      imageStatus:
        product.imageSource === "EXTERNAL_URL" ? "READY" : "NONE",
      imageApprovedAt:
        product.imageSource === "EXTERNAL_URL" ? new Date() : null,
      variants: product.variants.length
        ? {
            create: product.variants.map((variant) => ({
              size: variant.size,
              colour: variant.colour,
              sku: null,
              priceAdjustmentKobo: variant.priceAdjustmentKobo,
              stockQuantity: variant.stockQuantity,
            })),
          }
        : undefined,
    },
  });
  revalidatePath("/dashboard/products");
}

export async function toggleProductActiveAction(formData: FormData): Promise<void> {
  const session = await getMerchantSession();
  if (!session) return;
  const id = String(formData.get("id") ?? "");
  const product = await prisma.product.findFirst({
    where: { id, merchantId: session.merchantId },
  });
  if (!product) return;
  await prisma.product.update({
    where: { id: product.id },
    data: { active: !product.active },
  });
  revalidatePath("/dashboard/products");
}

const zoneCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  aliases: z.string().max(400).optional().or(z.literal("")),
  feeNaira: z.coerce.number().min(0).max(10_000_000),
});

export interface ZoneFormState {
  error: string | null;
  ok: boolean;
}

export async function createZoneAction(
  _prev: ZoneFormState,
  formData: FormData
): Promise<ZoneFormState> {
  const session = await getMerchantSession();
  if (!session) return { error: "unauthorized", ok: false };
  const parsed = zoneCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "invalid delivery zone",
      ok: false,
    };
  }

  try {
    await prisma.deliveryZone.create({
      data: {
        merchantId: session.merchantId,
        name: parsed.data.name,
        aliases: parseAliases(parsed.data.aliases),
        feeKobo: nairaAmountToKobo(parsed.data.feeNaira),
        active: true,
      },
    });
  } catch {
    return { error: "A delivery zone with this name already exists.", ok: false };
  }

  revalidatePath("/dashboard/products");
  return { error: null, ok: true };
}

const zoneSchema = z.object({
  id: z.string().min(1),
  feeNaira: z.coerce.number().min(0).max(10_000_000),
});

export async function updateZoneFeeAction(formData: FormData): Promise<void> {
  const session = await getMerchantSession();
  if (!session) return;
  const parsed = zoneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await prisma.deliveryZone.updateMany({
    where: { id: parsed.data.id, merchantId: session.merchantId },
    data: { feeKobo: nairaAmountToKobo(parsed.data.feeNaira) },
  });
  revalidatePath("/dashboard/products");
}

export async function toggleZoneActiveAction(formData: FormData): Promise<void> {
  const session = await getMerchantSession();
  if (!session) return;
  const id = String(formData.get("id") ?? "");
  const zone = await prisma.deliveryZone.findFirst({
    where: { id, merchantId: session.merchantId },
  });
  if (!zone) return;
  await prisma.deliveryZone.update({
    where: { id },
    data: { active: !zone.active },
  });
  revalidatePath("/dashboard/products");
}
