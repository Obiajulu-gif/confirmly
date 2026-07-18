import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  Banknote,
  FileWarning,
  Landmark,
  ListChecks,
  Lock,
  MessageSquareText,
  QrCode,
  Receipt,
  ScanLine,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import { ConfirmlyLogo, ConfirmlyMark } from "@/components/logo";
import { PhoneDemo } from "@/components/phone-demo";
import { Reveal } from "@/components/reveal";

const flowStrip = [
  "WhatsApp order",
  "structured order",
  "Monnify checkout",
  "payment verified",
  "receipt issued",
];

const problems = [
  {
    icon: MessageSquareText,
    title: "Scattered orders",
    body: "Order details buried across dozens of chats — quantities, sizes and addresses lost in the scroll.",
  },
  {
    icon: FileWarning,
    title: "Fake screenshots",
    body: "Edited payment screenshots pass for proof, and goods leave before money ever arrives.",
  },
  {
    icon: ListChecks,
    title: "Wrong totals",
    body: "Mental arithmetic across items, variants and delivery fees produces expensive mistakes.",
  },
  {
    icon: Banknote,
    title: "Unmatched transfers",
    body: "Bank alerts with no reference — hours lost matching payments to orders by hand.",
  },
  {
    icon: Receipt,
    title: "Manual receipts",
    body: "Typed receipts carry no proof and settle no dispute.",
  },
  {
    icon: ScanLine,
    title: "Missing audit trails",
    body: "When a dispute lands there is no record of who agreed to what, when.",
  },
];

const steps = [
  {
    n: "01",
    title: "Register your business",
    body: "Sign up, register the business, and add a settlement bank account. Monnify validates the account name and issues a dedicated subaccount.",
    visual: (
      <div className="space-y-2 font-mono text-xs">
        <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-2.5 text-brand-300">
          Account name resolved: ADA STYLES LTD
        </div>
        <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-2.5 text-brand-300">
          Subaccount created: MFY_SUB_…
        </div>
      </div>
    ),
  },
  {
    n: "02",
    title: "Customers chat like always",
    body: "A customer picks your store with its code, then orders in plain language — English, Nigerian English, or Pidgin. No app to download.",
    visual: (
      <div className="rounded-2xl rounded-br-md bg-[#d7fbe4] px-4 py-3 text-sm text-ink-900 shadow-lg">
        START ADASTYLES — I need two black polo shirts, large, to Yaba
      </div>
    ),
  },
  {
    n: "03",
    title: "Confirmly structures the order",
    body: "NVIDIA NIM extracts intent, your catalogue supplies every price, and the server does the maths in integer kobo. One summary, one explicit confirmation.",
    visual: (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 font-mono text-sm text-white/80">
        <div className="flex justify-between gap-8">
          <span>2 × Polo Shirt</span>
          <span>₦24,000</span>
        </div>
        <div className="flex justify-between gap-8">
          <span>Delivery · Yaba</span>
          <span>₦2,500</span>
        </div>
        <div className="mt-2 flex justify-between gap-8 border-t border-white/15 pt-2 font-bold text-brand-300">
          <span>TOTAL</span>
          <span>₦26,500</span>
        </div>
      </div>
    ),
  },
  {
    n: "04",
    title: "Monnify collects and verifies",
    body: "The customer pays a Monnify-generated checkout — never your personal account. The webhook is signature-checked, then the transaction is re-verified server-to-server.",
    visual: (
      <div className="space-y-2 font-mono text-xs">
        <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-2.5 text-brand-300">
          monnify-signature · HMAC-SHA512 valid
        </div>
        <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-2.5 text-brand-300">
          GET /v2/transactions/… → PAID
        </div>
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-red-300">
          screenshot.jpg → REJECTED
        </div>
      </div>
    ),
  },
  {
    n: "05",
    title: "Settlement routed to you",
    body: "Every checkout carries your subaccount in its income split, so Monnify settles your share straight to your registered bank account — tracked separately from payment verification.",
    visual: (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 font-mono text-xs text-white/80">
        <div className="flex justify-between gap-6">
          <span>splitPercentage</span>
          <span className="text-brand-300">100</span>
        </div>
        <div className="flex justify-between gap-6">
          <span>payment</span>
          <span className="text-brand-300">VERIFIED</span>
        </div>
        <div className="flex justify-between gap-6">
          <span>settlement</span>
          <span className="text-amber-300">PENDING</span>
        </div>
      </div>
    ),
  },
];

const trust = [
  {
    icon: FileWarning,
    title: "Screenshots never count as proof",
    body: "Only a server-verified Monnify transaction can mark an order paid. Claims and images are checked against the provider, not believed.",
  },
  {
    icon: Store,
    title: "Your catalogue controls prices",
    body: "The AI extracts intent only. Every price, fee and total comes from your database, calculated server-side in integer kobo.",
  },
  {
    icon: ShieldCheck,
    title: "Monnify verified server-side",
    body: "Signed webhooks, idempotent events, and a second server-to-server verification before any state changes.",
  },
  {
    icon: Lock,
    title: "Settlement details protected",
    body: "Bank account numbers are encrypted at rest, shown only masked, and never displayed as a checkout destination.",
  },
  {
    icon: ScanLine,
    title: "Every event auditable",
    body: "From first message to settlement, each step lands in a chronological, dispute-ready timeline.",
  },
  {
    icon: QrCode,
    title: "Receipts anyone can verify",
    body: "High-entropy tokens and QR codes resolve to VALID, REVOKED, or NOT FOUND — no arguments.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-night-900 text-white">
      {/* ------------------------------------------------ header */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-night-900/95">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Confirmly home">
            <ConfirmlyLogo tone="dark" />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            {(
              [
                ["#product", "Product"],
                ["#how-it-works", "How it works"],
                ["#for-merchants", "For merchants"],
                ["#security", "Security"],
              ] as const
            ).map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="hidden rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition hover:text-white lg:block"
              >
                {label}
              </Link>
            ))}
            <Link
              href="/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition hover:text-white sm:block"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="hidden rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/85 transition hover:border-brand-400/50 hover:text-white sm:block"
            >
              Create business account
            </Link>
            <Link
              href="/start"
              className="cta-glow rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-night-900 transition hover:bg-brand-400"
            >
              Order from store
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* ------------------------------------------------ hero */}
        <section id="product" className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="night-grid absolute inset-0" />
            <div className="absolute -left-40 -top-40 h-[480px] w-[480px] orb animate-orb" />
            <div
              className="absolute -right-40 top-40 h-[420px] w-[420px] orb orb-teal animate-orb"
              style={{ animationDelay: "-9s" }}
            />
          </div>

          <div className="relative mx-auto grid w-full max-w-6xl gap-14 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <p
                className="anim-fade-up inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-widest text-brand-300"
                style={{ "--d": "0.05s" } as React.CSSProperties}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-brand-400 [animation:glow-pulse_2.2s_ease-in-out_infinite]" />
                Multi-merchant · WhatsApp × Monnify × NVIDIA NIM
              </p>

              <h1
                className="anim-fade-up mt-6 text-[2.5rem] font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-[3.9rem]"
                style={{ "--d": "0.15s" } as React.CSSProperties}
              >
                Turn WhatsApp orders into{" "}
                <span className="text-gradient">verified payments.</span>
              </h1>

              <p
                className="anim-fade-up mt-6 max-w-xl text-lg leading-relaxed text-white/60"
                style={{ "--d": "0.3s" } as React.CSSProperties}
              >
                Confirmly helps merchants structure customer orders, collect
                payments through Monnify, and issue trusted receipts without
                leaving the sales flow they already use.
              </p>

              <div
                className="anim-fade-up mt-9 flex flex-col gap-3 sm:flex-row"
                style={{ "--d": "0.45s" } as React.CSSProperties}
              >
                <Link
                  href="/signup"
                  className="cta-glow inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-500 px-7 py-3.5 text-base font-bold text-night-900 transition hover:bg-brand-400"
                >
                  Create business account
                  <ArrowRight className="h-4.5 w-4.5" aria-hidden />
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-7 py-3.5 text-base font-semibold text-white/85 transition hover:border-brand-400/50 hover:text-white"
                >
                  View product flow
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </Link>
              </div>

              {/* flow strip */}
              <div
                className="anim-fade-up mt-10 flex flex-wrap items-center gap-2 text-[13px] font-medium text-white/55"
                style={{ "--d": "0.6s" } as React.CSSProperties}
              >
                {flowStrip.map((item, i) => (
                  <span key={item} className="flex items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                      {item}
                    </span>
                    {i < flowStrip.length - 1 ? (
                      <ArrowRight className="h-3.5 w-3.5 text-brand-400" aria-hidden />
                    ) : null}
                  </span>
                ))}
              </div>
            </div>

            <div
              className="anim-fade-up relative"
              style={{ "--d": "0.5s" } as React.CSSProperties}
            >
              <PhoneDemo />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ problems */}
        <section className="border-y border-white/5 bg-white/[0.02] py-20">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <Reveal>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-400">
                The problem
              </p>
              <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
                Selling on WhatsApp works. Managing it doesn&apos;t.
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {problems.map((p, i) => {
                const Icon = p.icon;
                return (
                  <Reveal key={p.title} delay={(i % 3) * 0.08}>
                    <div className="lift-card glass-card h-full rounded-2xl p-6">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-300">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <h3 className="mt-4 font-bold">{p.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-white/55">
                        {p.body}
                      </p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ------------------- how it works — stacked sticky scroll cards */}
        <section id="how-it-works" className="relative py-24">
          <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
            <Reveal>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-400">
                How it works
              </p>
              <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">
                From registration to settlement, verified at every step.
              </h2>
              <p className="mt-4 max-w-xl text-white/55">
                Keep scrolling — each step stacks on the last, exactly like the
                flow itself.
              </p>
            </Reveal>

            <div className="mt-16">
              {steps.map((step, i) => (
                <div
                  key={step.n}
                  className="sticky mb-8"
                  style={{ top: `${84 + i * 30}px` }}
                >
                  <article className="stack-card p-7 sm:p-10">
                    <div className="grid items-center gap-8 sm:grid-cols-[1.1fr_0.9fr]">
                      <div>
                        <div className="flex items-baseline gap-4">
                          <span className="font-mono text-4xl font-extrabold text-brand-500/40 sm:text-5xl">
                            {step.n}
                          </span>
                          <h3 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                            {step.title}
                          </h3>
                        </div>
                        <p className="mt-4 max-w-md leading-relaxed text-white/60">
                          {step.body}
                        </p>
                      </div>
                      <div className="sm:justify-self-end">{step.visual}</div>
                    </div>
                    <div
                      className="mt-8 flex items-center gap-1.5"
                      aria-hidden="true"
                    >
                      {steps.map((_, j) => (
                        <span
                          key={j}
                          className={`h-1 rounded-full transition-all ${
                            j <= i ? "w-6 bg-brand-400" : "w-3 bg-white/15"
                          }`}
                        />
                      ))}
                    </div>
                  </article>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ for merchants */}
        <section id="for-merchants" className="relative py-10 pb-24">
          <div className="orb pointer-events-none absolute inset-x-0 top-0 mx-auto h-[400px] max-w-4xl" />
          <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
            <Reveal>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-400">
                For merchants
              </p>
              <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
                A back office for the shop you run from your phone.
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: Store,
                  title: "Catalogue and variants",
                  body: "Products, aliases, sizes, colours, stock and delivery zones — the single source of truth for every order.",
                },
                {
                  icon: Landmark,
                  title: "Settlement account",
                  body: "Validated bank account, dedicated Monnify subaccount, masked everywhere, replaceable only with reauthentication.",
                },
                {
                  icon: Users,
                  title: "Conversations",
                  body: "Full transcripts with one-tap human takeover and resume. The bot steps aside the moment you type.",
                },
                {
                  icon: BadgeCheck,
                  title: "Payments and settlements",
                  body: "Verified revenue, pending settlements and settled amounts — tracked separately, honestly.",
                },
              ].map((f, i) => {
                const Icon = f.icon;
                return (
                  <Reveal key={f.title} delay={(i % 4) * 0.08}>
                    <div className="lift-card glass-card h-full rounded-2xl p-6">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <h3 className="mt-4 font-bold">{f.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-white/55">
                        {f.body}
                      </p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ security / trust */}
        <section id="security" className="border-t border-white/5 py-24">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <Reveal>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-400">
                Security
              </p>
              <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
                Trust, engineered in.
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {trust.map((t, i) => {
                const Icon = t.icon;
                return (
                  <Reveal key={t.title} delay={(i % 3) * 0.08}>
                    <div className="lift-card glass-card h-full rounded-2xl p-6">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <h3 className="mt-4 font-bold">{t.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-white/55">
                        {t.body}
                      </p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ final CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-brand-500/25 bg-gradient-to-br from-night-700 via-night-800 to-night-900 px-6 py-14 text-center sm:px-12">
              <div className="night-grid pointer-events-none absolute inset-0" />
              <div className="relative">
                <ConfirmlyMark className="mx-auto h-14 w-14" />
                <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
                  Start selling with clearer orders and verified payments.
                </h2>
                <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    href="/signup"
                    className="cta-glow inline-flex items-center justify-center rounded-2xl bg-brand-500 px-7 py-3.5 text-base font-bold text-night-900 transition hover:bg-brand-400"
                  >
                    Create business account
                  </Link>
                  <Link
                    href="/start"
                    className="inline-flex items-center justify-center rounded-2xl border border-white/15 px-7 py-3.5 text-base font-semibold text-white/85 transition hover:border-brand-400/50 hover:text-white"
                  >
                    Order from a store on WhatsApp
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ------------------------------------------------ footer */}
      <footer className="border-t border-white/5 py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-5 px-4 text-sm text-white/40 sm:flex-row sm:px-6">
          <ConfirmlyLogo tone="dark" className="opacity-90" />
          <span>
            © {new Date().getFullYear()} Confirmly · Payments by Monnify ·
            Orders understood by NVIDIA NIM
          </span>
        </div>
      </footer>
    </div>
  );
}
