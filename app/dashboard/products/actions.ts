"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getMerchantSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { nairaAmountToKobo } from "@/lib/money";

const productSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().or(z.literal("")),
  category: z.string().max(60).optional().or(z.literal("")),
  priceNaira: z.coerce.number().min(0).max(50_000_000),
  aliases: z.string().max(400).optional().or(z.literal("")),
  stockQuantity: z.coerce.number().int().min(0).max(1_000_000),
});

export interface ProductFormState {
  error: string | null;
  ok: boolean;
}

function parseAliases(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
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
  await prisma.product.create({
    data: {
      merchantId: session.merchantId,
      name: data.name,
      description: data.description || null,
      category: data.category || null,
      priceKobo: nairaAmountToKobo(data.priceNaira),
      aliases: parseAliases(data.aliases),
      stockQuantity: data.stockQuantity,
      active: true,
    },
  });
  revalidatePath("/dashboard/products");
  return { error: null, ok: true };
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
  const data = parsed.data;
  const { count } = await prisma.product.updateMany({
    where: { id, merchantId: session.merchantId },
    data: {
      name: data.name,
      description: data.description || null,
      category: data.category || null,
      priceKobo: nairaAmountToKobo(data.priceNaira),
      aliases: parseAliases(data.aliases),
      stockQuantity: data.stockQuantity,
    },
  });
  if (count === 0) return { error: "product not found", ok: false };
  revalidatePath("/dashboard/products");
  return { error: null, ok: true };
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
