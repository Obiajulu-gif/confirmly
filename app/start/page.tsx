import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { ConfirmlyLogo } from "@/components/logo";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Start an order",
  description:
    "Tell us who you are once — then order from WhatsApp like you always do.",
};

export default async function StartOrderPage() {
  const merchant = await prisma.merchant.findFirst({
    orderBy: { createdAt: "asc" },
  });
  const zones = merchant
    ? await prisma.deliveryZone.findMany({
        where: { merchantId: merchant.id, active: true },
        orderBy: { feeKobo: "asc" },
      })
    : [];

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-night-900 text-white">
      {/* ambience */}
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
          className="text-sm font-medium text-white/55 transition hover:text-white"
        >
          ← Home
        </Link>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-6 sm:pt-10">
        <div
          className="anim-fade-up rounded-3xl border border-white/10 bg-night-800/90 p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] sm:p-10"
          style={{ "--d": "0.1s" } as React.CSSProperties}
        >
          {merchant ? (
            <OnboardingForm
              merchantName={merchant.name}
              zones={zones.map((zone) => ({
                name: zone.name,
                feeLabel:
                  zone.feeKobo === 0 ? "free" : formatNaira(zone.feeKobo),
              }))}
            />
          ) : (
            <p className="text-white/70">
              No shop is configured yet — please check back shortly.
            </p>
          )}
        </div>

        <ol
          className="anim-fade-up mt-8 grid grid-cols-3 gap-3 text-center text-[11px] text-white/40 sm:text-xs"
          style={{ "--d": "0.3s" } as React.CSSProperties}
        >
          {["Tell us who you are", "Open WhatsApp & chat", "Pay securely, get a receipt"].map(
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
      </main>
    </div>
  );
}
