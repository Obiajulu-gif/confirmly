import Link from "next/link";
import { ArrowLeft, MessageCircle, Store } from "lucide-react";
import { prisma } from "@/lib/db";
import { buildWaLink } from "@/lib/orders/onboarding";
import { ConfirmlyLogo } from "@/components/logo";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Order on WhatsApp",
  description:
    "Pick a store and the chat opens with it selected — ordering, onboarding and payment all happen inside WhatsApp.",
};

/**
 * Store directory. There is no web form here on purpose: tapping a store
 * opens WhatsApp with `START <code>` prefilled, and the assistant handles
 * onboarding (name, delivery area) conversationally in the chat.
 */
export default async function StartOrderPage() {
  const merchants = await prisma.merchant.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    take: 24,
  });

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
          className="flex items-center gap-1.5 text-sm font-medium text-white/55 transition hover:text-white"
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
          <p className="mt-2 text-sm text-white/55">
            Tap a store and WhatsApp opens with it already selected. The
            assistant introduces itself, asks where deliveries should go, and
            takes your order — everything happens in the chat.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {merchants.map((m) => {
              const waLink = buildWaLink(m.storeCode);
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
                  <p className="mt-0.5 text-xs text-white/45">
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
            {merchants.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/55 sm:col-span-2">
                No stores are live yet. Merchants can create one in minutes
                from the Confirmly dashboard.
              </p>
            ) : null}
          </div>
        </div>

        <ol
          className="anim-fade-up mt-8 grid grid-cols-3 gap-3 text-center text-[11px] text-white/40 sm:text-xs"
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

        <p className="anim-fade-up mt-6 text-center text-xs leading-relaxed text-white/35" style={{ "--d": "0.4s" } as React.CSSProperties}>
          Sandbox note: this demo runs on Meta&apos;s test number, which can
          only reply to verified test numbers. Payments use the Monnify
          sandbox — no real money moves.
        </p>
      </main>
    </div>
  );
}
