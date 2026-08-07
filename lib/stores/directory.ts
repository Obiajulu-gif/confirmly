import "server-only";
import { prisma } from "@/lib/db";
import { searchScore } from "@/lib/orders/matching";

/**
 * Shared store discovery used by both the web directory (`/start`) and the
 * WhatsApp commerce menu, so a customer searching "ada" gets the same ranking
 * in either place.
 *
 * Ranking is done in memory against `searchScore` rather than in SQL: it gives
 * fuzzy/alias-tolerant matching that `ILIKE` cannot, and the candidate set is
 * bounded by CANDIDATE_CAP. If the platform ever outgrows that ceiling this is
 * the one function to move to Postgres full-text search.
 */

/** Minimum score for a store to count as a match. Mirrors product search. */
export const STORE_SEARCH_THRESHOLD = 0.5;

/** Upper bound on rows ranked in memory. */
const CANDIDATE_CAP = 500;

export interface StoreSummary {
  id: string;
  name: string;
  slug: string;
  storeCode: string;
  category: string | null;
  description: string | null;
}

export interface StoreSearchInput {
  /** Free-text query. Empty or absent returns the unfiltered directory. */
  query?: string | null;
  /** Exact category match, as returned by `listStoreCategories`. */
  category?: string | null;
  /** Rows to return. */
  limit?: number;
  /** Rows to skip, for pagination. */
  offset?: number;
}

export interface StoreSearchResult {
  stores: StoreSummary[];
  /** Total matches before limit/offset — drives "showing X of Y". */
  total: number;
  /** True when more rows exist past this page. */
  hasMore: boolean;
}

/**
 * Ranks stores against a free-text query, best first. Exported pure so the
 * ranking rules can be unit tested without a database.
 *
 * An empty query is not a filter — it returns the input untouched, preserving
 * whatever order the caller supplied.
 */
export function rankStores<T extends StoreSummary>(
  stores: T[],
  query: string
): T[] {
  const trimmed = query.trim();
  if (!trimmed) return stores;

  return stores
    .map((store) => ({
      store,
      score: Math.max(
        searchScore(trimmed, store.name),
        searchScore(trimmed, store.category ?? ""),
        searchScore(trimmed, store.storeCode)
      ),
    }))
    .filter((entry) => entry.score >= STORE_SEARCH_THRESHOLD)
    // Stable tiebreak on name so equal scores do not reorder between requests.
    .sort((a, b) => b.score - a.score || a.store.name.localeCompare(b.store.name))
    .map((entry) => entry.store);
}

/**
 * Clamps a page window and reports whether more rows follow. Exported pure so
 * the "Show more" affordance can be tested at its boundaries.
 */
export function paginate<T>(
  rows: T[],
  { limit, offset }: { limit: number; offset: number }
): { page: T[]; total: number; hasMore: boolean } {
  const safeOffset = Math.max(0, Math.floor(offset) || 0);
  const safeLimit = Math.max(1, Math.floor(limit) || 1);
  const page = rows.slice(safeOffset, safeOffset + safeLimit);
  return {
    page,
    total: rows.length,
    hasMore: safeOffset + page.length < rows.length,
  };
}

const STORE_SELECT = {
  id: true,
  name: true,
  slug: true,
  storeCode: true,
  category: true,
  description: true,
} as const;

export interface StoreCategory {
  name: string;
  count: number;
}

/**
 * Distinct categories across live stores with their store counts,
 * alphabetically. Stores with no category are omitted rather than bucketed
 * into a fake "Other".
 */
export async function listStoreCategories(): Promise<StoreCategory[]> {
  const rows = await prisma.merchant.groupBy({
    by: ["category"],
    where: { active: true, category: { not: null } },
    _count: { _all: true },
    take: CANDIDATE_CAP,
  });
  return rows
    .map((row) => ({
      name: row.category?.trim() ?? "",
      count: row._count._all,
    }))
    .filter((entry) => entry.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Ranked, filtered, paginated store search.
 *
 * With no query, stores are returned alphabetically. With a query they are
 * ranked by best score across name, category and store code, and anything
 * below STORE_SEARCH_THRESHOLD is dropped.
 */
export async function searchStores({
  query,
  category,
  limit = 12,
  offset = 0,
}: StoreSearchInput = {}): Promise<StoreSearchResult> {
  const trimmedQuery = query?.trim() ?? "";
  const trimmedCategory = category?.trim() ?? "";

  const candidates = await prisma.merchant.findMany({
    where: {
      active: true,
      ...(trimmedCategory ? { category: trimmedCategory } : {}),
    },
    orderBy: { name: "asc" },
    take: CANDIDATE_CAP,
    select: STORE_SELECT,
  });

  const matched = rankStores(candidates, trimmedQuery);
  const { page, total, hasMore } = paginate(matched, { limit, offset });

  return { stores: page, total, hasMore };
}
