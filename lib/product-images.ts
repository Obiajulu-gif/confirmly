import "server-only";

import { createHash } from "node:crypto";
import { appUrl } from "@/lib/env";
import { prisma } from "@/lib/db";

export type SupportedProductImageType =
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export class ProductImageError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "invalid_image"
      | "image_too_large"
      | "invalid_url"
      | "product_not_found"
  ) {
    super(message);
    this.name = "ProductImageError";
  }
}

export function detectProductImageType(
  bytes: Uint8Array
): SupportedProductImageType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function validateExternalImageUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProductImageError("Enter a valid HTTPS image URL.", "invalid_url");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new ProductImageError(
      "Product image URLs must be public HTTPS URLs without embedded credentials.",
      "invalid_url"
    );
  }
  if (
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase()) ||
    url.hostname.endsWith(".local")
  ) {
    throw new ProductImageError("Private image URLs are not allowed.", "invalid_url");
  }
  return url;
}

function productPublicImageUrl(productId: string): string {
  return `${appUrl()}/api/public/products/${encodeURIComponent(productId)}/image?v=${Date.now()}`;
}

export async function saveStoredProductImage(input: {
  merchantId: string;
  productId: string;
  bytes: Buffer;
  source: "MERCHANT_UPLOAD" | "AI_GENERATED";
  prompt?: string | null;
}): Promise<{ imageUrl: string; contentType: SupportedProductImageType }> {
  const contentType = detectProductImageType(input.bytes);
  if (!contentType) {
    throw new ProductImageError(
      "Only genuine JPEG, PNG, and WebP images are supported.",
      "invalid_image"
    );
  }
  const databaseBytes = Uint8Array.from(input.bytes);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const imageUrl = productPublicImageUrl(input.productId);
  const approvedAt = input.source === "MERCHANT_UPLOAD" ? new Date() : null;

  const product = await prisma.product.findFirst({
    where: { id: input.productId, merchantId: input.merchantId },
    select: { id: true },
  });
  if (!product) {
    throw new ProductImageError("Product not found.", "product_not_found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.productImageAsset.upsert({
      where: { productId: input.productId },
      update: {
        merchantId: input.merchantId,
        bytes: databaseBytes,
        contentType,
        sizeBytes: input.bytes.length,
        sha256,
      },
      create: {
        productId: input.productId,
        merchantId: input.merchantId,
        bytes: databaseBytes,
        contentType,
        sizeBytes: input.bytes.length,
        sha256,
      },
    });
    await tx.product.update({
      where: { id: input.productId },
      data: {
        imageUrl,
        imageSource: input.source,
        imageStatus: "READY",
        imagePrompt: input.prompt ?? null,
        imageGeneratedAt:
          input.source === "AI_GENERATED" ? new Date() : null,
        imageApprovedAt: approvedAt,
        imageFailureReason: null,
        imageContentHash: sha256,
        imageAltText: null,
      },
    });
    await tx.auditEvent.create({
      data: {
        merchantId: input.merchantId,
        event:
          input.source === "AI_GENERATED"
            ? "AI product illustration generated"
            : "Merchant product image uploaded",
        actor: "MERCHANT",
        metadata: {
          productId: input.productId,
          source: input.source,
          contentType,
          sizeBytes: input.bytes.length,
        },
      },
    });
  });

  return { imageUrl, contentType };
}

export async function saveExternalProductImage(input: {
  merchantId: string;
  productId: string;
  imageUrl: string;
}): Promise<{ imageUrl: string }> {
  const imageUrl = validateExternalImageUrl(input.imageUrl).toString();
  const product = await prisma.product.findFirst({
    where: { id: input.productId, merchantId: input.merchantId },
    select: { id: true },
  });
  if (!product) {
    throw new ProductImageError("Product not found.", "product_not_found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.productImageAsset.deleteMany({
      where: { productId: input.productId, merchantId: input.merchantId },
    });
    await tx.product.update({
      where: { id: input.productId },
      data: {
        imageUrl,
        imageSource: "EXTERNAL_URL",
        imageStatus: "READY",
        imagePrompt: null,
        imageGeneratedAt: null,
        imageApprovedAt: new Date(),
        imageFailureReason: null,
        imageContentHash: null,
      },
    });
    await tx.auditEvent.create({
      data: {
        merchantId: input.merchantId,
        event: "External product image configured",
        actor: "MERCHANT",
        metadata: { productId: input.productId },
      },
    });
  });
  return { imageUrl };
}

export async function removeProductImage(input: {
  merchantId: string;
  productId: string;
}): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, merchantId: input.merchantId },
    select: { id: true },
  });
  if (!product) {
    throw new ProductImageError("Product not found.", "product_not_found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.productImageAsset.deleteMany({
      where: { productId: input.productId, merchantId: input.merchantId },
    });
    await tx.product.update({
      where: { id: input.productId },
      data: {
        imageUrl: null,
        imageSource: null,
        imageStatus: "NONE",
        imagePrompt: null,
        imageGeneratedAt: null,
        imageApprovedAt: null,
        imageFailureReason: null,
        imageContentHash: null,
        imageAltText: null,
      },
    });
    await tx.auditEvent.create({
      data: {
        merchantId: input.merchantId,
        event: "Product image removed",
        actor: "MERCHANT",
        metadata: { productId: input.productId },
      },
    });
  });
}

export async function approveGeneratedProductImage(input: {
  merchantId: string;
  productId: string;
}): Promise<void> {
  const product = await prisma.product.findFirst({
    where: {
      id: input.productId,
      merchantId: input.merchantId,
      imageSource: "AI_GENERATED",
      imageStatus: "READY",
    },
    select: { id: true, imageAsset: { select: { id: true } } },
  });
  if (!product?.imageAsset) {
    throw new ProductImageError(
      "A generated image is not ready for approval.",
      "product_not_found"
    );
  }
  await prisma.product.update({
    where: { id: product.id },
    data: { imageApprovedAt: new Date() },
  });
  await prisma.auditEvent.create({
    data: {
      merchantId: input.merchantId,
      event: "AI product illustration approved",
      actor: "MERCHANT",
      metadata: { productId: input.productId },
    },
  });
}
