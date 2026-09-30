"use client";

import Link from "next/link";
import { useRef } from "react";
import { Search, X } from "lucide-react";

export type ProductFilterValues = {
  q: string;
  category: string;
  status: string;
  stock: string;
  image: string;
  sort: string;
};

const selectClass =
  "w-full min-w-0 rounded-lg border border-ink-900/10 bg-surface-raised px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25";

/**
 * Catalogue search + filters. A plain GET form, so filtered views are
 * shareable URLs and work without JavaScript; dropdowns apply on change.
 */
export function ProductFilters({
  values,
  categories,
  filtered,
}: {
  values: ProductFilterValues;
  categories: string[];
  filtered: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const apply = () => formRef.current?.requestSubmit();

  return (
    <form ref={formRef} method="GET" role="search" aria-label="Search products" className="space-y-3">
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search products</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" aria-hidden />
          <input
            type="search"
            name="q"
            defaultValue={values.q}
            placeholder="Search name, description, category or SKU"
            className="w-full rounded-lg border border-ink-900/10 bg-surface-raised py-2 pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-500/70 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
          />
        </label>
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Search
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <label className="min-w-0">
          <span className="sr-only">Category</span>
          <select name="category" defaultValue={values.category} onChange={apply} className={selectClass}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          <span className="sr-only">Status</span>
          <select name="status" defaultValue={values.status} onChange={apply} className={selectClass}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
        <label className="min-w-0">
          <span className="sr-only">Stock</span>
          <select name="stock" defaultValue={values.stock} onChange={apply} className={selectClass}>
            <option value="">Any stock</option>
            <option value="in">In stock</option>
            <option value="low">Low stock (5 or less)</option>
            <option value="out">Out of stock</option>
          </select>
        </label>
        <label className="min-w-0">
          <span className="sr-only">Photo</span>
          <select name="image" defaultValue={values.image} onChange={apply} className={selectClass}>
            <option value="">Any photo</option>
            <option value="with">Has a photo</option>
            <option value="missing">No photo</option>
            <option value="pending">AI photo awaiting approval</option>
          </select>
        </label>
        <label className="col-span-2 min-w-0 sm:col-span-1">
          <span className="sr-only">Sort by</span>
          <select name="sort" defaultValue={values.sort} onChange={apply} className={selectClass}>
            <option value="">Sort: category, A–Z</option>
            <option value="newest">Sort: newest first</option>
            <option value="price-asc">Sort: price, low to high</option>
            <option value="price-desc">Sort: price, high to low</option>
            <option value="stock-asc">Sort: lowest stock first</option>
          </select>
        </label>
      </div>

      {filtered ? (
        <Link
          href="/dashboard/products"
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
        >
          <X className="h-4 w-4" aria-hidden />
          Clear search and filters
        </Link>
      ) : null}
    </form>
  );
}
