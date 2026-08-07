import Link from "next/link";
import { ArrowLeft, MessageCircle, Search, Store, X } from "lucide-react";
import { buildWaLink } from "@/lib/orders/onboarding";
import { listStoreCategories, searchStores } from "@/lib/stores/directory";
import { resolveWhatsAppPublicNumber } from "@/lib/whatsapp/client";
import { ConfirmlyLogo } from "@/components/logo";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Order on WhatsApp",
  description:
    "Search the stores on Confirmly and pick one — the chat opens with it selected, and ordering, onboarding and payment all happen inside WhatsApp.",
};

const PAGE_SIZE = 24;

/** Builds a querystring for the filter links, dropping empty values. */
function hrefFor(params: { q?: string; category?: string }): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  const qs = search.toString();
  return qs ? `/start?${qs}` : "/start";
}

/**
 * Store directory. There is no web order form here on purpose: tapping a store
 * opens WhatsApp with `START <code>` prefilled, and the assistant handles
 * onboarding (name, delivery area) conversationally in the chat.
 *
 * Search and category filtering are server-rendered through searchParams, so
 * the page stays a server component and every filtered view is linkable.
 */
export default async function StartOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const category = params.category?.trim() ?? "";

  const [{ stores, total, hasMore }, categories, publicNumber] =
    await Promise.all([
      searchStores({ query, category, limit: PAGE_SIZE }),
      listStoreCategories(),
      // Resolve the real display number (env value, else Meta lookup) once.
      resolveWhatsAppPublicNumber().catch(() => null),
    ]);

  const isFiltered = Boolean(query || category);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-night-900 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="night-grid absolute inset-0" />
        <div className="absolute -left-40 top-0 h-[420px] w-[420px] orb animate-orb" />
        <div
          className="absolute -right-40 bottom-0 h-[380px] w-[380px] orb orb-teal animate-orb"
          style={{ animationDelay: "-8s" }}
        />
      </div>

      <header className="relative z-10 mx-auto flex h-16 w-full max-w-2xl items-center justify-between px-4">
        <Link href="/" aria-label="Back to Confirmly home">
          <ConfirmlyLogo tone="dark" />
        </Link>
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm font-medium text-white/65 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Home
        </Link>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-6 sm:pt-10">
        <div
          className="anim-fade-up"
          style={{ "--d": "0.1s" } as React.CSSProperties}
        >
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            Choose a store
          </h1>
          <p className="mt-2 text-sm text-white/65">
            Tap a store and WhatsApp opens with it already selected. The
            assistant introduces itself, asks where deliveries should go, and
            takes your order — everything happens in the chat.
          </p>

          {/* ------------------------------------------------ search */}
          <form
            method="get"
            action="/start"
            role="search"
            className="mt-6 flex gap-2"
          >
            {/* Preserve the active category when searching within it. */}
            {category ? (
              <input type="hidden" name="category" value={category} />
            ) : null}
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50"
                aria-hidden
              />
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Search stores by name or category"
                aria-label="Search stores"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-10 pr-3 text-sm text-white placeholder:text-white/45 focus:border-brand-400/50 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-night-900 transition hover:bg-brand-400"
            >
              Search
            </button>
          </form>

          {/* ------------------------------------------------ category filter */}
          {categories.length > 0 ? (
            <div
              className="mt-3 flex flex-wrap gap-2"
              role="group"
              aria-label="Filter stores by category"
            >
              <Link
                href={hrefFor({ q: query })}
                aria-current={category ? undefined : "true"}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                  category
                    ? "border-white/12 bg-white/[0.03] text-white/70 hover:text-white"
                    : "border-brand-400/50 bg-brand-500/15 text-brand-300"
                }`}
              >
                All
              </Link>
              {categories.map(({ name, count }) => {
                const active = category === name;
                return (
                  <Link
                    key={name}
                    href={hrefFor({ q: query, category: active ? undefined : name })}
                    aria-current={active ? "true" : undefined}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "border-brand-400/50 bg-brand-500/15 text-brand-300"
                        : "border-white/12 bg-white/[0.03] text-white/70 hover:text-white"
                    }`}
                  >
                    {name}
                    <span className="ml-1.5 font-normal opacity-60">{count}</span>
                  </Link>
                );
              })}
            </div>
          ) : null}

          {/* ------------------------------------------------ result summary */}
          {isFiltered ? (
            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-white/65">
              <span>
                {total === 0
                  ? "No stores found"
                  : `${total} store${total === 1 ? "" : "s"} found`}
                {query ? (
                  <>
                    {" "}
                    for <span className="font-semibold text-white">“{query}”</span>
                  </>
                ) : null}
                {category ? (
                  <>
                    {" "}
                    in <span className="font-semibold text-white">{category}</span>
                  </>
                ) : null}
              </span>
              <Link
                href="/start"
                className="inline-flex items-center gap-1 rounded-full border border-white/12 px-3 py-1 text-xs font-semibold text-white/70 transition hover:text-white"
              >
                <X className="h-3 w-3" aria-hidden />
                Clear
              </Link>
            </div>
          ) : null}

          {/* ------------------------------------------------ results */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {stores.map((m) => {
              const waLink = buildWaLink(m.storeCode, publicNumber);
              const card = (
                <>
                  <div className="flex items-start justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
                      <Store className="h-4 w-4" aria-hidden />
                    </span>
                    {waLink ? (
                      <span className="flex items-center gap-1 rounded-full bg-[#25D366]/15 px-2.5 py-1 text-[11px] font-semibold text-[#4ade80]">
                        <MessageCircle className="h-3 w-3" aria-hidden />
                        Chat to order
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 font-bold text-white group-hover:text-brand-300">
                    {m.name}
                  </p>
                  <p className="mt-0.5 text-xs text-white/60">
                    {m.category ?? "Store"} · Code {m.storeCode}
                  </p>
                </>
              );
              return waLink ? (
                <a
                  key={m.id}
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lift-card group rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                >
                  {card}
                </a>
              ) : (
                <div
                  key={m.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 opacity-80"
                >
                  {card}
                  <p className="mt-2 text-[11px] text-amber-300/80">
                    WhatsApp line not configured yet
                  </p>
                </div>
              );
            })}

            {stores.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/65 sm:col-span-2">
                {isFiltered ? (
                  <>
                    <p className="font-semibold text-white">
                      Nothing matched that search.
                    </p>
                    <p className="mt-1">
                      Try a shorter word, or{" "}
                      <Link
                        href="/start"
                        className="font-semibold text-brand-300 underline underline-offset-2"
                      >
                        browse every store
                      </Link>
                      .
                    </p>
                  </>
                ) : (
                  <p>
                    No stores are live yet. Merchants can create one in minutes
                    from the Confirmly dashboard.
                  </p>
                )}
              </div>
            ) : null}
          </div>

          {hasMore ? (
            <p className="mt-4 text-center text-xs text-white/60">
              Showing the first {stores.length} of {total}. Narrow it down with
              a search or a category.
            </p>
          ) : null}
        </div>

        <ol
          className="anim-fade-up mt-8 grid grid-cols-3 gap-3 text-center text-[11px] text-white/60 sm:text-xs"
          style={{ "--d": "0.3s" } as React.CSSProperties}
        >
          {["Tap a store to open WhatsApp", "The assistant onboards you in chat", "Pay securely, get a verified receipt"].map(
            (label, i) => (
              <li
                key={label}
                className="rounded-xl border border-white/10 bg-white/[0.02] px-2 py-3"
              >
                <span className="mb-1 block font-mono text-sm font-bold text-brand-400">
                  {i + 1}
                </span>
                {label}
              </li>
            )
          )}
        </ol>

        <p
          className="anim-fade-up mt-6 text-center text-xs leading-relaxed text-white/55"
          style={{ "--d": "0.4s" } as React.CSSProperties}
        >
          Sandbox note: this demo runs on Meta&apos;s test number, which can
          only reply to verified test numbers. Payments use the Monnify
          sandbox — no real money moves.
        </p>
      </main>
    </div>
  );
}
