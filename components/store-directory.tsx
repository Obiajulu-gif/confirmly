"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, MessageCircle, Package, Search, SlidersHorizontal, Star, Store, X } from "lucide-react";
import type { PublicStore } from "@/lib/stores";
import { StoreArtwork } from "@/components/store-artwork";

const SORTS = {
  newest: "Newest",
  name: "Name A–Z",
  products: "Most products",
  rating: "Top rated",
} as const;
type SortKey = keyof typeof SORTS;

const isSort = (v: string): v is SortKey => v in SORTS;

export function StoreDirectory({
  stores,
  initial,
}: {
  stores: PublicStore[];
  initial: { q: string; category: string; location: string; sort: string };
}) {
  const [query, setQuery] = useState(initial.q);
  const [category, setCategory] = useState(initial.category);
  const [location, setLocation] = useState(initial.location);
  const [sort, setSort] = useState<SortKey>(isSort(initial.sort) ? initial.sort : "newest");
  const q = useDeferredValue(query.trim().toLowerCase());

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of stores) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [stores]);

  const locations = useMemo(
    () => [...new Set(stores.flatMap((s) => (s.location ? [s.location] : [])))].sort(),
    [stores]
  );

  const results = useMemo(() => {
    const list = stores.filter((s) => {
      if (category && s.category !== category) return false;
      if (location && s.location !== location) return false;
      if (!q) return true;
      return [s.name, s.storeCode, s.category, s.description ?? "", s.location ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    const by: Record<SortKey, (a: PublicStore, b: PublicStore) => number> = {
      newest: (a, b) => b.joinedAt.localeCompare(a.joinedAt),
      name: (a, b) => a.name.localeCompare(b.name),
      products: (a, b) => b.productCount - a.productCount,
      rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.reviewCount - a.reviewCount,
    };
    return list.sort(by[sort]);
  }, [stores, q, category, location, sort]);

  // Keep the URL shareable without triggering a server round trip.
  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (category) params.set("category", category);
    if (location) params.set("location", location);
    if (sort !== "newest") params.set("sort", sort);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/stores?${qs}` : "/stores");
  }, [query, category, location, sort]);

  const filtered = Boolean(query || category || location);
  const clear = () => {
    setQuery("");
    setCategory("");
    setLocation("");
  };

  return (
    <>
      {/* ------------------------------------------------ header + search */}
      <section className="relative overflow-hidden pb-10 pt-6 sm:pt-12">
        <div className="pointer-events-none absolute inset-0 light-dot-grid" />
        <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <span className="anim-fade-up rounded-full bg-[#17c19a]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#17c19a]">
            {stores.length} store{stores.length === 1 ? "" : "s"} live
          </span>
          <h1
            className="anim-fade-up mt-4 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl"
            style={{ "--d": "0.06s" } as React.CSSProperties}
          >
            Stores on <span className="text-[#17c19a]">Confirmly</span>
          </h1>
          <p
            className="anim-fade-up mt-3 max-w-2xl text-base text-gray-600 sm:text-lg"
            style={{ "--d": "0.12s" } as React.CSSProperties}
          >
            Every business here takes orders on WhatsApp and payments verified by
            Monnify. Tap a store and the chat opens with it already selected.
          </p>

          <div
            className="anim-fade-up mt-8 flex flex-col gap-3 lg:flex-row"
            style={{ "--d": "0.18s" } as React.CSSProperties}
          >
            <label className="relative flex-1">
              <span className="sr-only">Search stores</span>
              <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by store name, code, niche or location"
                className="w-full rounded-full border border-gray-200 bg-white py-4 pl-14 pr-5 text-base shadow-sm outline-none transition placeholder:text-gray-400 focus:border-[#17c19a] focus:ring-4 focus:ring-[#17c19a]/15"
              />
            </label>
            <div className="flex gap-3">
              <label className="relative flex-1 lg:w-52 lg:flex-none">
                <span className="sr-only">Location</span>
                <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="h-full w-full appearance-none rounded-full border border-gray-200 bg-white py-4 pl-10 pr-5 text-sm font-semibold shadow-sm outline-none transition focus:border-[#17c19a] focus:ring-4 focus:ring-[#17c19a]/15"
                >
                  <option value="">All locations</option>
                  {locations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="relative flex-1 lg:w-48 lg:flex-none">
                <span className="sr-only">Sort by</span>
                <SlidersHorizontal className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="h-full w-full appearance-none rounded-full border border-gray-200 bg-white py-4 pl-10 pr-5 text-sm font-semibold shadow-sm outline-none transition focus:border-[#17c19a] focus:ring-4 focus:ring-[#17c19a]/15"
                >
                  {Object.entries(SORTS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* niche chips */}
          <div
            className="anim-fade-up -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
            style={{ "--d": "0.24s" } as React.CSSProperties}
            role="group"
            aria-label="Filter by niche"
          >
            {[["", stores.length] as const, ...categories].map(([c, n]) => {
              const on = category === c;
              return (
                <button
                  key={c || "all"}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCategory(c)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    on
                      ? "border-[#111827] bg-[#111827] text-white"
                      : "border-gray-200 bg-white text-gray-700 hover:border-[#17c19a] hover:text-[#0d8067]"
                  }`}
                >
                  {c || "All niches"}
                  <span className={`text-xs ${on ? "text-white/60" : "text-gray-400"}`}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ results */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-center justify-between gap-4 text-sm text-gray-500" aria-live="polite">
          <span>
            Showing <strong className="text-[#111827]">{results.length}</strong> of {stores.length} stores
          </span>
          {filtered ? (
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1.5 font-semibold text-[#0d8067] hover:underline"
            >
              <X className="h-4 w-4" aria-hidden />
              Clear filters
            </button>
          ) : null}
        </div>

        {results.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
            <Store className="mx-auto h-10 w-10 text-gray-300" aria-hidden />
            <p className="mt-4 text-lg font-bold">
              {stores.length === 0 ? "No stores are live yet" : "No stores match those filters"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {stores.length === 0
                ? "Be the first — creating a store takes a few minutes."
                : "Try a different search or clear the filters."}
            </p>
            {stores.length === 0 ? (
              <Link
                href="/signup"
                className="mt-6 inline-flex rounded-full bg-[#17c19a] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#0fa17f]"
              >
                Create your store
              </Link>
            ) : (
              <button
                type="button"
                onClick={clear}
                className="mt-6 inline-flex rounded-full border border-gray-200 px-6 py-3 text-sm font-bold transition hover:border-[#17c19a]"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((s, i) => (
              <li
                key={s.id}
                className="anim-fade-up"
                style={{ "--d": `${Math.min(i, 8) * 0.04}s` } as React.CSSProperties}
              >
                <StoreCard store={s} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function StoreCard({ store }: { store: PublicStore }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:border-[#17c19a]/40 hover:shadow-xl hover:shadow-gray-200/60">
      <div className="relative aspect-[16/10] overflow-hidden text-[15px]">
        <div className="h-full w-full transition duration-500 group-hover:scale-[1.04]">
          <StoreArtwork store={store} />
        </div>
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#111827] shadow-sm backdrop-blur">
          {store.category}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold leading-tight">{store.name}</h2>
          {store.rating ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
              {store.rating.toFixed(1)}
              <span className="font-medium text-gray-400">({store.reviewCount})</span>
            </span>
          ) : null}
        </div>
        {store.description ? (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-gray-600">{store.description}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-gray-500">
          {store.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {store.location}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Package className="h-3.5 w-3.5" aria-hidden />
            {store.productCount} product{store.productCount === 1 ? "" : "s"}
          </span>
          <span className="font-mono">Code {store.storeCode}</span>
        </div>

        <div className="mt-auto pt-5">
          {store.waLink ? (
            <a
              href={store.waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#111827] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#17c19a]"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              Order on WhatsApp
            </a>
          ) : (
            <p className="rounded-full bg-gray-100 px-5 py-3 text-center text-sm font-semibold text-gray-500">
              Send <span className="font-mono">START {store.storeCode}</span> on WhatsApp
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
