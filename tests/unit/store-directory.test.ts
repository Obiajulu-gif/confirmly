import { describe, expect, it } from "vitest";
import {
  paginate,
  rankStores,
  STORE_SEARCH_THRESHOLD,
  type StoreSummary,
} from "@/lib/stores/directory";

/**
 * Store discovery ranking and pagination. Both are exported pure, so these run
 * without a database — which matters here because the suite shares one module
 * registry (`isolate: false`) and a Prisma mock would leak into the
 * integration tests.
 *
 * Category filtering is deliberately not covered here: it is a Prisma `where`
 * clause, not application logic, and belongs to the integration suite.
 */

function store(name: string, extra: Partial<StoreSummary> = {}): StoreSummary {
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  return {
    id: `id-${slug}`,
    name,
    slug,
    storeCode: name.toUpperCase().replace(/\s+/g, ""),
    category: null,
    description: null,
    ...extra,
  };
}

const CATALOGUE: StoreSummary[] = [
  store("Ada Styles", { category: "Fashion" }),
  store("Ada Electronics", { category: "Electronics" }),
  store("Bola Fabrics", { category: "Fashion" }),
  store("Chidi Phones", { category: "Electronics" }),
  store("Dele Groceries", { category: "Food" }),
];

const names = (stores: StoreSummary[]) => stores.map((s) => s.name);

describe("rankStores", () => {
  it("puts an exact name match first", () => {
    expect(names(rankStores(CATALOGUE, "Ada Styles"))[0]).toBe("Ada Styles");
  });

  it("finds every store sharing a name prefix", () => {
    const found = names(rankStores(CATALOGUE, "Ada"));
    expect(found).toContain("Ada Styles");
    expect(found).toContain("Ada Electronics");
    expect(found).not.toContain("Dele Groceries");
  });

  it("matches on category, not just name", () => {
    expect(names(rankStores(CATALOGUE, "Fashion"))).toEqual([
      "Ada Styles",
      "Bola Fabrics",
    ]);
  });

  it("matches on store code", () => {
    expect(names(rankStores(CATALOGUE, "CHIDIPHONES"))[0]).toBe("Chidi Phones");
  });

  it("breaks score ties by name so paging stays stable", () => {
    // Both score identically on the category; name decides the order.
    expect(names(rankStores(CATALOGUE, "Electronics"))).toEqual([
      "Ada Electronics",
      "Chidi Phones",
    ]);
  });

  it("is stable across repeated calls", () => {
    const once = names(rankStores(CATALOGUE, "Ada"));
    const twice = names(rankStores(CATALOGUE, "Ada"));
    expect(once).toEqual(twice);
  });

  it("returns nothing when nothing clears the threshold", () => {
    expect(rankStores(CATALOGUE, "zzzzquux")).toEqual([]);
  });

  it("treats an empty query as no filter and preserves input order", () => {
    expect(names(rankStores(CATALOGUE, ""))).toEqual(names(CATALOGUE));
    expect(names(rankStores(CATALOGUE, "   "))).toEqual(names(CATALOGUE));
  });

  it("never returns a store scoring below the threshold", () => {
    // "Dele" shares nothing with the fashion stores.
    const found = rankStores(CATALOGUE, "Dele Groceries");
    expect(found[0]?.name).toBe("Dele Groceries");
    expect(STORE_SEARCH_THRESHOLD).toBeGreaterThan(0);
  });

  it("handles an empty catalogue", () => {
    expect(rankStores([], "anything")).toEqual([]);
  });

  it("tolerates stores with no category", () => {
    const uncategorised = [store("Plain Shop")];
    expect(names(rankStores(uncategorised, "Plain"))).toEqual(["Plain Shop"]);
  });
});

describe("paginate", () => {
  const rows = [1, 2, 3, 4, 5];

  it("reports the total across all rows, not just the page", () => {
    const { page, total, hasMore } = paginate(rows, { limit: 2, offset: 0 });
    expect(page).toEqual([1, 2]);
    expect(total).toBe(5);
    expect(hasMore).toBe(true);
  });

  it("walks every page without repeating or dropping a row", () => {
    const seen: number[] = [];
    for (let p = 0; p < 3; p++) {
      seen.push(...paginate(rows, { limit: 2, offset: p * 2 }).page);
    }
    expect(seen).toEqual(rows);
    expect(new Set(seen).size).toBe(rows.length);
  });

  it("clears hasMore on the last page", () => {
    const { page, hasMore } = paginate(rows, { limit: 2, offset: 4 });
    expect(page).toEqual([5]);
    expect(hasMore).toBe(false);
  });

  it("returns an empty page past the end without claiming more exist", () => {
    const { page, total, hasMore } = paginate(rows, { limit: 2, offset: 99 });
    expect(page).toEqual([]);
    expect(total).toBe(5);
    expect(hasMore).toBe(false);
  });

  it("clamps a negative offset to the first page", () => {
    expect(paginate(rows, { limit: 2, offset: -5 }).page).toEqual([1, 2]);
  });

  it("clamps a zero or negative limit to one row", () => {
    expect(paginate(rows, { limit: 0, offset: 0 }).page).toEqual([1]);
    expect(paginate(rows, { limit: -3, offset: 0 }).page).toEqual([1]);
  });

  it("handles an empty input", () => {
    const { page, total, hasMore } = paginate([], { limit: 5, offset: 0 });
    expect(page).toEqual([]);
    expect(total).toBe(0);
    expect(hasMore).toBe(false);
  });
});
