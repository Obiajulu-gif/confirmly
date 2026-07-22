"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Platform-admin mutations. Every action re-checks getAdminSession() (never
 * trusting the page), writes an AuditEvent, and prefers soft-deactivation over
 * deletion because orders/settlements reference these rows (onDelete: Restrict).
 */

class NotAdminError extends Error {
  constructor() {
    super("Not authorized");
    this.name = "NotAdminError";
  }
}

async function requireAdmin(): Promise<{ userId: string; email: string }> {
  const session = await getAdminSession();
  if (!session) throw new NotAdminError();
  return { userId: session.userId, email: session.email };
}

/** Records a platform-admin action against a merchant's audit trail. */
async function audit(
  merchantId: string,
  event: string,
  admin: { email: string },
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      merchantId,
      event,
      actor: "SYSTEM",
      metadata: { ...metadata, by: "platform-admin", adminEmail: admin.email },
    },
  });
}

const toggleMerchant = z.object({
  merchantId: z.string().min(1),
  active: z.coerce.boolean(),
});

/** Activate or deactivate a merchant (soft — never deletes). */
export async function setMerchantActive(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const { merchantId, active } = toggleMerchant.parse({
    merchantId: formData.get("merchantId"),
    active: formData.get("active"),
  });
  await prisma.merchant.update({
    where: { id: merchantId },
    data: { active },
  });
  await audit(merchantId, active ? "Merchant activated" : "Merchant deactivated", admin);
  logger.info("admin toggled merchant", { merchantId, active });
  revalidatePath("/admin/merchants");
  revalidatePath("/admin");
}

const toggleProduct = z.object({
  productId: z.string().min(1),
  active: z.coerce.boolean(),
});

/** Activate or deactivate a product across any store. */
export async function setProductActive(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const { productId, active } = toggleProduct.parse({
    productId: formData.get("productId"),
    active: formData.get("active"),
  });
  const product = await prisma.product.update({
    where: { id: productId },
    data: { active },
    select: { merchantId: true, name: true },
  });
  await audit(
    product.merchantId,
    active ? "Product activated (admin)" : "Product deactivated (admin)",
    admin,
    { productId, name: product.name }
  );
  logger.info("admin toggled product", { productId, active });
  revalidatePath("/admin/products");
}

const toggleOptIn = z.object({
  customerId: z.string().min(1),
  optedIn: z.coerce.boolean(),
});

/** Toggle a customer's WhatsApp opt-in (controls outbound re-engagement). */
export async function setCustomerOptIn(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const { customerId, optedIn } = toggleOptIn.parse({
    customerId: formData.get("customerId"),
    optedIn: formData.get("optedIn"),
  });
  const customer = await prisma.customer.update({
    where: { id: customerId },
    data: { optedIn },
    select: { merchantId: true },
  });
  await audit(
    customer.merchantId,
    optedIn ? "Customer opted in (admin)" : "Customer opted out (admin)",
    admin,
    { customerId }
  );
  revalidatePath("/admin/customers");
}
