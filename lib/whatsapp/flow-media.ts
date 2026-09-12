import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Best-effort product imagery for the native Flow. Images live in PostgreSQL
 * (ProductImageAsset.bytes — already the merchant-approved / policy-checked
 * asset), so there is no external fetch and no SSRF surface. Every value is
 * returned as raw Base64 (the format Flow Image `src` and data-source `image`
 * fields expect). A failure returns null: the Flow renders fine without an
 * image and must never break because one could not be produced.
 */

// Warm-function cache: `${productId}:${kind}` -> base64 (or null = no image).
const cache = new Map<string, string | null>();

// List thumbnails have a smaller limit than the standalone Image component.
const MAX_THUMB_BYTES = 100_000;
const MAX_DETAIL_BYTES = 900_000;

async function resizeJpeg(bytes: Buffer, width: number): Promise<Buffer | null> {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(bytes)
      .resize(width, width, { fit: "cover", withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
  } catch (err) {
    logger.warn("flow image resize unavailable", {
      reason: err instanceof Error ? err.message : "unknown",
    });
    return null;
  }
}

/**
 * Raw Base64 image for a product, or null when none is available. `thumb` is a
 * small square for catalogue rows; `detail` is a larger square for the product
 * view.
 */
export async function productImageBase64(
  productId: string,
  kind: "thumb" | "detail"
): Promise<string | null> {
  const key = `${productId}:${kind}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  let result: string | null = null;
  try {
    const asset = await prisma.productImageAsset.findUnique({
      where: { productId },
      select: { bytes: true },
    });
    if (asset?.bytes) {
      const source = Buffer.from(asset.bytes);
      const width = kind === "thumb" ? 200 : 600;
      const resized = await resizeJpeg(source, width);
      const limit = kind === "thumb" ? MAX_THUMB_BYTES : MAX_DETAIL_BYTES;
      // A failed decode/resize must not send the original invalid or oversized
      // asset into WhatsApp, which can reject the entire screen for one image.
      if (resized && resized.length <= limit) result = resized.toString("base64");
    }
  } catch (err) {
    logger.warn("flow image load failed", {
      productId,
      reason: err instanceof Error ? err.message : "unknown",
    });
  }

  cache.set(key, result);
  return result;
}

/** Thumbnails for a batch of products, resolved in parallel and best-effort. */
export async function productThumbnails(
  productIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    productIds.map(async (id) => {
      const b64 = await productImageBase64(id, "thumb");
      if (b64) out.set(id, b64);
    })
  );
  return out;
}
