import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { detectProductImageType } from "@/lib/product-images";
import { getReceiptFonts, renderTextPath } from "@/lib/receipts/fonts";

/**
 * Store logos for the WhatsApp store-picker cards. Bytes live inline in Postgres
 * (like ProductImageAsset), and the Flow needs them as raw Base64 under 100KB.
 * A merchant can upload one; when none exists a branded initials tile is
 * generated on the fly. Text in the generated tile is drawn as opentype vector
 * paths (never SVG <text>) so it renders crisply on Linux/Vercel without fonts.
 */

// Warm-function cache: merchantId -> base64 thumbnail (logo or generated tile).
const cache = new Map<string, string>();

const THUMB = 160; // square px sent into the Flow
const MAX_STORE_BYTES = 6 * 1024 * 1024;

export class StoreLogoError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_image" | "image_too_large" | "merchant_not_found"
  ) {
    super(message);
    this.name = "StoreLogoError";
  }
}

function logoPublicUrl(merchantId: string): string {
  return `${appUrl()}/api/public/merchants/${encodeURIComponent(merchantId)}/logo?v=${Date.now()}`;
}

/** Deterministic, pleasant background colour derived from the store name. */
function colourFromName(name: string): string {
  const palette = [
    "#0f766e", "#7c3aed", "#be123c", "#b45309", "#1d4ed8",
    "#0369a1", "#15803d", "#c2410c", "#9d174d", "#4338ca",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length]!;
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/** Renders a branded initials tile (vector paths, no font dependency). */
async function generateInitialsTile(name: string): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const initials = initialsOf(name);
  const bg = colourFromName(name);
  const fontSize = initials.length > 1 ? 64 : 84;
  const font = getReceiptFonts().bold;
  // Baseline roughly vertically centred for uppercase glyphs.
  const baseline = THUMB / 2 + fontSize * 0.34;
  const textPath = renderTextPath(font, initials, THUMB / 2, baseline, fontSize, "middle", "#ffffff");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB}" height="${THUMB}" viewBox="0 0 ${THUMB} ${THUMB}"><rect width="${THUMB}" height="${THUMB}" rx="28" fill="${bg}"/>${textPath}</svg>`;
  return sharp(Buffer.from(svg, "utf8")).jpeg({ quality: 80 }).toBuffer();
}

/**
 * Raw Base64 thumbnail for a store, always non-null: the merchant's uploaded
 * logo when present, otherwise a generated initials tile. Safe/best-effort —
 * never throws (a broken asset falls back to the generated tile).
 */
export async function getStoreLogoBase64(merchant: {
  id: string;
  name: string;
}): Promise<string> {
  const cached = cache.get(merchant.id);
  if (cached) return cached;

  const sharp = (await import("sharp")).default;
  let out: string | null = null;
  try {
    const asset = await prisma.merchantImageAsset.findUnique({
      where: { merchantId: merchant.id },
      select: { bytes: true },
    });
    if (asset?.bytes) {
      const buf = await sharp(Buffer.from(asset.bytes))
        .resize(THUMB, THUMB, { fit: "contain", background: "#ffffff" })
        .jpeg({ quality: 78 })
        .toBuffer();
      out = buf.toString("base64");
    }
  } catch (err) {
    logger.warn("store logo load failed, using generated tile", {
      merchantId: merchant.id,
      reason: err instanceof Error ? err.message : "unknown",
    });
  }

  if (!out) {
    try {
      out = (await generateInitialsTile(merchant.name)).toString("base64");
    } catch (err) {
      logger.warn("store initials tile generation failed", {
        merchantId: merchant.id,
        reason: err instanceof Error ? err.message : "unknown",
      });
      // 1x1 transparent PNG as a last resort so the Flow item still renders.
      out =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQAY3Y2wAAAAAElFTkSuQmCC";
    }
  }

  cache.set(merchant.id, out);
  return out;
}

/** Base64 logos for a batch of stores, resolved in parallel. */
export async function storeLogos(
  stores: Array<{ id: string; name: string }>
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    stores.map(async (s) => {
      out.set(s.id, await getStoreLogoBase64(s));
    })
  );
  return out;
}

/** Persists a merchant-uploaded store logo and points logoUrl at the public route. */
export async function saveStoreLogo(input: {
  merchantId: string;
  bytes: Buffer;
}): Promise<{ logoUrl: string }> {
  if (input.bytes.length > MAX_STORE_BYTES) {
    throw new StoreLogoError("Image is larger than 6MB.", "image_too_large");
  }
  const contentType = detectProductImageType(input.bytes);
  if (!contentType) {
    throw new StoreLogoError(
      "Only genuine JPEG, PNG, and WebP images are supported.",
      "invalid_image"
    );
  }
  const merchant = await prisma.merchant.findUnique({
    where: { id: input.merchantId },
    select: { id: true },
  });
  if (!merchant) throw new StoreLogoError("Store not found.", "merchant_not_found");

  // Store a right-sized copy (fit inside 512²) so the DB row stays small.
  const sharp = (await import("sharp")).default;
  const stored = await sharp(input.bytes)
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .toBuffer();
  const finalType = detectProductImageType(stored) ?? contentType;
  const sha256 = createHash("sha256").update(stored).digest("hex");
  const logoUrl = logoPublicUrl(input.merchantId);

  await prisma.$transaction(async (tx) => {
    await tx.merchantImageAsset.upsert({
      where: { merchantId: input.merchantId },
      update: { bytes: Uint8Array.from(stored), contentType: finalType, sizeBytes: stored.length, sha256 },
      create: {
        merchantId: input.merchantId,
        bytes: Uint8Array.from(stored),
        contentType: finalType,
        sizeBytes: stored.length,
        sha256,
      },
    });
    await tx.merchant.update({ where: { id: input.merchantId }, data: { logoUrl } });
    await tx.auditEvent.create({
      data: {
        merchantId: input.merchantId,
        event: "Store logo uploaded",
        actor: "MERCHANT",
        metadata: { contentType: finalType, sizeBytes: stored.length },
      },
    });
  });
  cache.delete(input.merchantId);
  return { logoUrl };
}

/** Removes a merchant's uploaded logo (reverts to the generated tile). */
export async function removeStoreLogo(merchantId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.merchantImageAsset.deleteMany({ where: { merchantId } });
    await tx.merchant.update({ where: { id: merchantId }, data: { logoUrl: null } });
    await tx.auditEvent.create({
      data: {
        merchantId,
        event: "Store logo removed",
        actor: "MERCHANT",
        metadata: {},
      },
    });
  });
  cache.delete(merchantId);
}

/** Returns the stored logo bytes for the public serving route (or null). */
export async function getStoreLogoAsset(
  merchantId: string
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const asset = await prisma.merchantImageAsset.findUnique({
    where: { merchantId },
    select: { bytes: true, contentType: true },
  });
  if (!asset?.bytes) return null;
  return { bytes: Buffer.from(asset.bytes), contentType: asset.contentType };
}
