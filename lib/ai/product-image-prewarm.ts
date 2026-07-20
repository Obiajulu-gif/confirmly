import "server-only";

import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  generateProductImage,
  ProductImageGenerationError,
} from "@/lib/ai/product-image-generator";
import {
  approveGeneratedProductImage,
  saveStoredProductImage,
} from "@/lib/product-images";

export type ProductImagePrewarmOptions = {
  merchantId?: string;
  productIds?: string[];
  limit?: number;
  autoApprove?: boolean;
  maxAttempts?: number;
  timeoutMs?: number;
  steps?: number;
  maxRuntimeMs?: number;
  retryAfterMinutes?: number;
};

export type ProductImagePrewarmResult = {
  checked: number;
  generated: number;
  approved: number;
  failed: number;
  skipped: number;
  disabled: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * Generates customer-ready illustrations before a product is requested.
 *
 * Merchant uploads and external images are never replaced. AI illustrations
 * are generated one at a time, persisted in PostgreSQL, and optionally approved
 * so WhatsApp can display them immediately with the existing AI disclosure.
 */
export async function prewarmProductImages(
  options: ProductImagePrewarmOptions = {}
): Promise<ProductImagePrewarmResult> {
  const result: ProductImagePrewarmResult = {
    checked: 0,
    generated: 0,
    approved: 0,
    failed: 0,
    skipped: 0,
    disabled: false,
  };

  const config = env();
  if (
    !config.NVIDIA_IMAGE_GENERATION_ENABLED ||
    !(config.NVIDIA_IMAGE_API_KEY ?? config.NVIDIA_API_KEY)
  ) {
    result.disabled = true;
    return result;
  }

  const limit = clamp(options.limit ?? 2, 1, 5);
  const retryAfterMinutes = clamp(options.retryAfterMinutes ?? 30, 5, 24 * 60);
  const maxRuntimeMs = clamp(options.maxRuntimeMs ?? 50_000, 10_000, 55_000);
  const startedAt = Date.now();
  const retryBefore = new Date(Date.now() - retryAfterMinutes * 60_000);
  const staleProcessingBefore = new Date(Date.now() - 15 * 60_000);

  const candidates = await prisma.product.findMany({
    where: {
      active: true,
      merchant: { active: true },
      ...(options.merchantId ? { merchantId: options.merchantId } : {}),
      ...(options.productIds?.length
        ? { id: { in: options.productIds.slice(0, 50) } }
        : {}),
      OR: [
        {
          imageSource: "AI_GENERATED",
          imageStatus: "READY",
          imageApprovedAt: null,
          imageAsset: { isNot: null },
        },
        {
          imageSource: "AI_GENERATED",
          imageStatus: "READY",
          imageApprovedAt: null,
          imageAsset: { is: null },
        },
        { imageSource: null, imageStatus: "NONE" },
        {
          imageSource: null,
          imageStatus: "FAILED",
          OR: [
            { imageGeneratedAt: null },
            { imageGeneratedAt: { lte: retryBefore } },
          ],
        },
        {
          imageSource: "AI_GENERATED",
          imageStatus: "FAILED",
          OR: [
            { imageGeneratedAt: null },
            { imageGeneratedAt: { lte: retryBefore } },
          ],
        },
        {
          imageSource: null,
          imageStatus: "PROCESSING",
          updatedAt: { lte: staleProcessingBefore },
        },
        {
          imageSource: "AI_GENERATED",
          imageStatus: "PROCESSING",
          updatedAt: { lte: staleProcessingBefore },
        },
      ],
    },
    include: {
      variants: true,
      imageAsset: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  for (const product of candidates) {
    if (Date.now() - startedAt >= maxRuntimeMs - 5_000) break;
    result.checked += 1;

    if (
      product.imageSource === "AI_GENERATED" &&
      product.imageStatus === "READY" &&
      !product.imageApprovedAt &&
      product.imageAsset
    ) {
      if (options.autoApprove !== false) {
        try {
          await approveGeneratedProductImage({
            merchantId: product.merchantId,
            productId: product.id,
          });
          result.approved += 1;
        } catch (error) {
          result.failed += 1;
          logger.warn("product image prewarm approval failed", {
            merchantId: product.merchantId,
            productId: product.id,
            reason: error instanceof Error ? error.message : "unknown",
          });
        }
      } else {
        result.skipped += 1;
      }
      continue;
    }

    const claimed = await prisma.product.updateMany({
      where: {
        id: product.id,
        merchantId: product.merchantId,
        imageSource: product.imageSource,
        imageStatus: product.imageStatus,
        updatedAt: product.updatedAt,
      },
      data: {
        imageStatus: "PROCESSING",
        imageFailureReason: null,
        imageGeneratedAt: new Date(),
      },
    });
    if (!claimed.count) {
      result.skipped += 1;
      continue;
    }

    const remainingMs = maxRuntimeMs - (Date.now() - startedAt);
    const timeoutMs = clamp(
      Math.min(options.timeoutMs ?? 40_000, remainingMs - 2_000),
      5_000,
      45_000
    );

    try {
      const generated = await generateProductImage(
        {
          name: product.name,
          category: product.category,
          description: product.description,
          colours: [
            ...new Set(
              product.variants
                .map((variant) => variant.colour)
                .filter((value): value is string => Boolean(value))
            ),
          ],
          sizes: [
            ...new Set(
              product.variants
                .map((variant) => variant.size)
                .filter((value): value is string => Boolean(value))
            ),
          ],
        },
        {
          maxAttempts: options.maxAttempts ?? 1,
          timeoutMs,
          // Fall through to NVIDIA_IMAGE_STEPS (flux.1-dev needs >= 5).
          steps: options.steps,
        }
      );

      await saveStoredProductImage({
        merchantId: product.merchantId,
        productId: product.id,
        bytes: generated.bytes,
        source: "AI_GENERATED",
        prompt: generated.prompt,
      });

      if (options.autoApprove !== false) {
        await approveGeneratedProductImage({
          merchantId: product.merchantId,
          productId: product.id,
        });
        result.approved += 1;
      }
      result.generated += 1;
      logger.info("product image pre-generated", {
        merchantId: product.merchantId,
        productId: product.id,
        autoApproved: options.autoApprove !== false,
      });
    } catch (error) {
      result.failed += 1;
      const reason =
        error instanceof ProductImageGenerationError || error instanceof Error
          ? error.message
          : "Product image generation failed.";
      await prisma.product.updateMany({
        where: {
          id: product.id,
          merchantId: product.merchantId,
          imageStatus: "PROCESSING",
        },
        data: {
          imageStatus: "FAILED",
          imageFailureReason: reason.slice(0, 300),
          imageGeneratedAt: new Date(),
        },
      });
      logger.warn("product image pre-generation failed", {
        merchantId: product.merchantId,
        productId: product.id,
        reason,
      });
    }
  }

  return result;
}
