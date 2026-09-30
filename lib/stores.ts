import "server-only";
import { prisma } from "@/lib/db";
import { buildWaLink } from "@/lib/orders/onboarding";
import { resolveWhatsAppPublicNumber } from "@/lib/whatsapp/client";

/**
 * Public store directory — the storefront view of every live branch, shared by
 * the landing-page showcase and `/stores`. Only customer-safe fields leave
 * this module: no emails, phone numbers or payment details.
 */
export interface PublicStore {
  id: string;
  name: string;
  storeCode: string;
  category: string;
  description: string | null;
  logoUrl: string | null;
  location: string | null;
  /** Up to four approved product photos, used as the card artwork. */
  images: string[];
  productCount: number;
  rating: number | null;
  reviewCount: number;
  /** Opens WhatsApp with the store preselected; null until the line is set up. */
  waLink: string | null;
  joinedAt: string;
}

const MAX_STORES = 500;
const IMAGES_PER_STORE = 4;

/** Fold free-text categories ("fashion ", "Fashion") into one filter chip. */
function normaliseCategory(raw: string | null): string {
  const value = raw?.trim();
  if (!value) return "Other";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export async function getPublicStores(
  options: { limit?: number } = {}
): Promise<PublicStore[]> {
  const merchants = await prisma.merchant.findMany({
    where: { active: true, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take: Math.min(options.limit ?? MAX_STORES, MAX_STORES),
    select: {
      id: true,
      name: true,
      storeCode: true,
      category: true,
      description: true,
      logoUrl: true,
      stateRegion: true,
      createdAt: true,
      products: {
        where: { active: true, imageStatus: "READY", imageUrl: { not: null } },
        orderBy: { updatedAt: "desc" },
        take: IMAGES_PER_STORE,
        select: { imageUrl: true },
      },
      _count: { select: { products: { where: { active: true } } } },
    },
  });
  if (merchants.length === 0) return [];

  const [ratings, publicNumber] = await Promise.all([
    prisma.review.groupBy({
      by: ["merchantId"],
      where: { merchantId: { in: merchants.map((m) => m.id) } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    resolveWhatsAppPublicNumber().catch(() => null),
  ]);
  const ratingBy = new Map(ratings.map((r) => [r.merchantId, r]));

  return merchants.map((m) => {
    const r = ratingBy.get(m.id);
    return {
      id: m.id,
      name: m.name,
      storeCode: m.storeCode,
      category: normaliseCategory(m.category),
      description: m.description,
      logoUrl: m.logoUrl,
      location: m.stateRegion?.trim() || null,
      images: m.products.flatMap((p) => (p.imageUrl ? [p.imageUrl] : [])),
      productCount: m._count.products,
      rating: r?._avg.rating ?? null,
      reviewCount: r?._count._all ?? 0,
      waLink: buildWaLink(m.storeCode, publicNumber),
      joinedAt: m.createdAt.toISOString(),
    };
  });
}

/**
 * Same as {@link getPublicStores} but never throws — marketing pages render
 * without the directory rather than failing when the database is unreachable
 * (e.g. a build with no DATABASE_URL).
 */
export async function getPublicStoresSafe(
  options: { limit?: number } = {}
): Promise<PublicStore[]> {
  try {
    return await getPublicStores(options);
  } catch (error) {
    console.warn("[stores] directory unavailable:", error instanceof Error ? error.message : error);
    return [];
  }
}
