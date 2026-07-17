import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Building2,
  Check,
  Landmark,
  MessageSquareText,
  PackageOpen,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getBanks, type Bank } from "@/lib/monnify/banks";
import { ConfirmlyLogo } from "@/components/logo";
import { logoutAction } from "@/app/(auth)/login/actions";
import { BusinessForm, SettlementForm } from "./wizard-forms";
import { finishOnboardingAction, starterCatalogueAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up your business" };

/** Common Nigerian banks — fallback when the Monnify bank API is unreachable. */
const FALLBACK_BANKS: Bank[] = [
  { name: "Access Bank", code: "044" },
  { name: "Fidelity Bank", code: "070" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "First City Monument Bank", code: "214" },
  { name: "Guaranty Trust Bank", code: "058" },
  { name: "Kuda Microfinance Bank", code: "50211" },
  { name: "Moniepoint MFB", code: "50515" },
  { name: "Opay Digital Services", code: "999992" },
  { name: "Palmpay", code: "999991" },
  { name: "Polaris Bank", code: "076" },
  { name: "Stanbic IBTC Bank", code: "221" },
  { name: "Sterling Bank", code: "232" },
  { name: "Union Bank of Nigeria", code: "032" },
  { name: "United Bank For Africa", code: "033" },
  { name: "Wema Bank", code: "035" },
  { name: "Zenith Bank", code: "057" },
];

const STEPS = [
  { key: "business", label: "Business", icon: Building2 },
  { key: "settlement", label: "Settlement account", icon: Landmark },
  { key: "catalogue", label: "Catalogue and delivery", icon: PackageOpen },
  { key: "whatsapp", label: "WhatsApp store code", icon: MessageSquareText },
] as const;

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/onboarding");

  // Determine wizard progress from the database, never from the browser.
  const merchant = session.merchantId
    ? await prisma.merchant.findUnique({
        where: { id: session.merchantId },
        include: {
          paymentProfiles: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          _count: { select: { products: true, deliveryZones: true } },
        },
      })
    : null;

  let step = 0;
  if (merchant) {
    const hasProfile = merchant.paymentProfiles.length > 0;
    const hasCatalogue =
      merchant._count.products > 0 && merchant._count.deliveryZones > 0;
    if (!hasProfile) step = 1;
    else if (!hasCatalogue) step = 2;
    else step = 3;
    if (merchant.onboardedAt && hasProfile && hasCatalogue) {
      redirect("/dashboard");
    }
  }

  let banks = FALLBACK_BANKS;
  if (step === 1) {
    try {
      banks = await getBanks();
    } catch {
      banks = FALLBACK_BANKS;
    }
  }

  const profile = merchant?.paymentProfiles[0] ?? null;
  const waNumber = env().WHATSAPP_PUBLIC_NUMBER?.replace(/\D/g, "") ?? "";
  const waLink =
    merchant && waNumber
      ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`START ${merchant.storeCode}`)}`
      : null;

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-ink-900/5 bg-surface-raised">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4">
          <Link href="/" aria-label="Confirmly home">
            <ConfirmlyLogo />
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-sm font-medium text-ink-500 hover:text-ink-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">
          Set up your business
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Four steps and you are ready to take verified WhatsApp orders.
        </p>

        {/* Step indicator */}
        <ol className="mt-8 grid grid-cols-4 gap-2" aria-label="Onboarding progress">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const stateClass =
              i < step
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : i === step
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-ink-900/10 bg-surface-raised text-ink-500";
            return (
              <li key={s.key} className="text-center">
                <div
                  className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full border-2 transition ${stateClass}`}
                  aria-current={i === step ? "step" : undefined}
                >
                  {i < step ? (
                    <Check className="h-5 w-5" aria-hidden />
                  ) : (
                    <Icon className="h-5 w-5" aria-hidden />
                  )}
                </div>
                <p className="mt-2 text-[11px] font-medium text-ink-500">
                  {s.label}
                </p>
              </li>
            );
          })}
        </ol>

        <div className="mt-8 rounded-card border border-ink-900/5 bg-surface-raised p-6 shadow-sm sm:p-8">
          {step === 0 ? (
            <>
              <h2 className="text-lg font-bold text-ink-900">
                Tell us about your business
              </h2>
              <p className="mb-6 mt-1 text-sm text-ink-500">
                This appears on receipts and your public store pages.
              </p>
              <BusinessForm />
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h2 className="text-lg font-bold text-ink-900">
                Where should your money settle?
              </h2>
              <p className="mb-6 mt-1 text-sm text-ink-500">
                Monnify validates the account name, then creates a dedicated
                subaccount so verified payments settle directly to you.
              </p>
              <SettlementForm banks={banks} />
            </>
          ) : null}

          {step === 2 && merchant ? (
            <>
              <h2 className="text-lg font-bold text-ink-900">
                Catalogue and delivery zones
              </h2>
              <p className="mb-6 mt-1 text-sm text-ink-500">
                Start with a sample product and Lagos delivery zones — you can
                edit everything in the dashboard afterwards.
              </p>
              {profile && profile.subaccountStatus !== "ACTIVE" ? (
                <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
                  Settlement status: {profile.subaccountStatus.replace(/_/g, " ")}
                  {profile.subaccountStatus === "ACTIVATION_REQUIRED"
                    ? " — the Monnify Sub Account feature needs activation before merchant-routed checkout goes live."
                    : ""}
                </p>
              ) : null}
              <form action={starterCatalogueAction}>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Create starter catalogue and zones
                </button>
              </form>
            </>
          ) : null}

          {step === 3 && merchant ? (
            <>
              <h2 className="text-lg font-bold text-ink-900">
                Your WhatsApp store code
              </h2>
              <p className="mb-6 mt-1 text-sm text-ink-500">
                One Confirmly WhatsApp number serves every merchant. Customers
                pick your store with this code before ordering — catalogues are
                never mixed.
              </p>
              <div className="rounded-xl border border-ink-900/10 bg-surface p-5 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Customers send
                </p>
                <p className="mt-2 font-mono text-2xl font-bold text-brand-700">
                  START {merchant.storeCode}
                </p>
                {waLink ? (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block rounded-lg border border-brand-600 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                  >
                    Open prefilled WhatsApp chat
                  </a>
                ) : (
                  <p className="mt-3 text-xs text-ink-500">
                    The shared WhatsApp number will appear here once configured.
                  </p>
                )}
              </div>
              <p className="mt-4 text-xs text-ink-500">
                Share link: {env().APP_URL}/start?store={merchant.storeCode}
              </p>
              <form action={finishOnboardingAction} className="mt-6">
                <button
                  type="submit"
                  className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Finish setup and open dashboard
                </button>
              </form>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
