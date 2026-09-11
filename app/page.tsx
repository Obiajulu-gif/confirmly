import Link from "next/link";
import {
  BadgeCheck,
  Banknote,
  CheckCircle2,
  ChevronDown,
  Clock,
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
import { Reveal } from "@/components/reveal";
import { WhatsAppQr } from "@/components/whatsapp-qr";
import { Hero3DCarousel } from "@/components/hero-3d-carousel";
import { LandingNav } from "@/components/landing-nav";

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
        <div className="rounded-xl border border-[#17c19a]/30 bg-[#17c19a]/10 px-4 py-2.5 text-[#0d8067]">
          Account name resolved: ADA STYLES LTD
        </div>
        <div className="rounded-xl border border-[#17c19a]/30 bg-[#17c19a]/10 px-4 py-2.5 text-[#0d8067]">
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
      <div className="rounded-2xl rounded-br-md bg-[#e8f9f5] border border-[#17c19a]/30 px-4 py-3 text-sm text-[#111827] shadow-sm">
        START ADASTYLES — I need two black polo shirts, large, to Yaba
      </div>
    ),
  },
  {
    n: "03",
    title: "Confirmly structures the order",
    body: "NVIDIA NIM extracts intent, your catalogue supplies every price, and the server does the maths in integer kobo. One summary, one explicit confirmation.",
    visual: (
      <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 font-mono text-sm text-gray-800 shadow-sm">
        <div className="flex justify-between gap-8">
          <span>2 × Polo Shirt</span>
          <span>₦24,000</span>
        </div>
        <div className="flex justify-between gap-8">
          <span>Delivery · Yaba</span>
          <span>₦2,500</span>
        </div>
        <div className="mt-2 flex justify-between gap-8 border-t border-gray-200 pt-2 font-bold text-[#17c19a]">
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
        <div className="rounded-xl border border-[#17c19a]/30 bg-[#17c19a]/10 px-4 py-2.5 text-[#0d8067]">
          monnify-signature · HMAC-SHA512 valid
        </div>
        <div className="rounded-xl border border-[#17c19a]/30 bg-[#17c19a]/10 px-4 py-2.5 text-[#0d8067]">
          GET /v2/transactions/… → PAID
        </div>
        <div className="rounded-xl border border-[#a9000c]/30 bg-[#a9000c]/10 px-4 py-2.5 text-[#a9000c]">
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
      <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 font-mono text-xs text-gray-800 shadow-sm">
        <div className="flex justify-between gap-6">
          <span>splitPercentage</span>
          <span className="text-[#17c19a] font-bold">100</span>
        </div>
        <div className="flex justify-between gap-6">
          <span>payment</span>
          <span className="text-[#17c19a] font-bold">VERIFIED</span>
        </div>
        <div className="flex justify-between gap-6">
          <span>settlement</span>
          <span className="text-amber-600 font-bold">PENDING</span>
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

const metrics = [
  { value: "100%", label: "Payments verified with Monnify, server-side" },
  { value: "0", label: "Screenshots ever accepted as proof" },
  { value: "7", label: "Monnify APIs integrated end to end" },
  { value: "24/7", label: "Automated ordering on WhatsApp" },
];

const faqs = [
  {
    q: "Do my customers need to download an app?",
    a: "No. Customers order in the WhatsApp thread they already use. They pick your store with a short code, then chat in plain language — nothing to install or learn.",
  },
  {
    q: "How is a payment actually confirmed?",
    a: "Only a server-to-server verification against Monnify can mark an order paid. Screenshots, redirects and unsigned callbacks are never trusted — the provider is the single source of truth.",
  },
  {
    q: "Where does my money settle?",
    a: "Into your own bank account. Each merchant gets a dedicated Monnify subaccount, and every checkout carries your income split, so Confirmly never holds a float.",
  },
  {
    q: "What does the AI decide?",
    a: "Only what the customer meant — the product, variant, quantity and delivery area. Every price, fee and total comes from your catalogue and is computed server-side in integer kobo.",
  },
  {
    q: "Can one WhatsApp number serve several branches?",
    a: "Yes. One shared number serves every branch; customers select a branch before ordering, and catalogues, stock and orders stay scoped to that branch.",
  },
  {
    q: "Is my bank information safe?",
    a: "Account numbers are encrypted at rest, shown only masked, and never presented to a customer as a payment destination.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#fcfcfc] text-[#111827]">
      {/* ------------------------------------------------ header: separate rounded containers with mobile support */}
      <LandingNav />

      <main className="flex-1">
        {/* ------------------------------------------------ hero section */}
        <section id="product" className="relative overflow-hidden pt-4 sm:pt-8 pb-16 sm:pb-20">
          {/* Light Dot Grid Background */}
          <div className="pointer-events-none absolute inset-0 light-dot-grid" />

          <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center px-4 text-center sm:px-6 lg:px-8">
            {/* BIG EMOTIONAL STATEMENT - responsive font scaling */}
            <h1 className="mt-2 sm:mt-4 max-w-4xl text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-tight text-[#111827] leading-[1.08] sm:leading-[1.05] font-heading">
              Your next sale <br />
              should feel <span className="text-[#17c19a]">this easy.</span>
            </h1>

            {/* Smaller type underneath headline */}
            <p className="mt-2.5 sm:mt-3 text-xs sm:text-sm md:text-base font-bold tracking-widest text-[#17c19a] uppercase">
              Chat. Order. Pay. Confirm.
            </p>

            {/* BUSINESS + CUSTOMER VISUAL WORLD (Hero's Main Character) */}
            <div className="w-full -mt-2 sm:-mt-5">
              <Hero3DCarousel />
            </div>

            {/* ONE SHORT EXPLANATION */}
            <p className="mt-2 sm:mt-3 max-w-2xl text-base sm:text-lg md:text-xl font-medium leading-relaxed text-gray-600 px-2 sm:px-0">
              Confirmly brings your WhatsApp sales together, so you can spend less time chasing orders and payments and more time serving your customers.
            </p>

            {/* ONE STRONG CTA */}
            <div className="mt-6 sm:mt-8 flex w-full sm:w-auto flex-col sm:flex-row items-center justify-center gap-3 px-4 sm:px-0">
              <Link
                href="/signup"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-[#17c19a] px-8 py-3.5 sm:py-4 text-base font-bold text-white shadow-xl shadow-[#17c19a]/25 transition hover:bg-[#0fa17f] hover:shadow-2xl active:scale-95"
              >
                Get Started
              </Link>
            </div>
          </div>
        </section>




        {/* ------------------------------------------------ metrics band */}
        <section className="border-y border-gray-200 bg-white py-12">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-8 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
            {metrics.map((m) => (
              <div key={m.label} className="text-center">
                <p className="text-4xl font-extrabold text-[#17c19a] sm:text-5xl">
                  {m.value}
                </p>
                <p className="mx-auto mt-2 max-w-[15rem] text-sm font-medium leading-relaxed text-gray-600">
                  {m.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ problems */}
        <section className="py-20 bg-[#f8faf9] border-b border-gray-200/80">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="text-center max-w-3xl mx-auto">
                <span className="rounded-full bg-[#a9000c]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#a9000c]">
                  The Problem
                </span>
                <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[#111827] sm:text-5xl">
                  Selling on WhatsApp works. Managing it doesn&apos;t.
                </h2>
              </div>
            </Reveal>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {problems.map((p, i) => {
                const Icon = p.icon;
                return (
                  <Reveal key={p.title} delay={(i % 3) * 0.08}>
                    <div className="h-full rounded-2xl border border-gray-200 bg-white p-7 shadow-sm transition hover:shadow-md hover:border-[#a9000c]/30">
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#a9000c]/10 text-[#a9000c]">
                        <Icon className="h-6 w-6" aria-hidden />
                      </span>
                      <h3 className="mt-5 text-xl font-bold text-[#111827]">{p.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-gray-600">
                        {p.body}
                      </p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ------------------- how it works — stacked scroll cards */}
        <section id="how-it-works" className="relative py-24 bg-[#fcfcfc]">
          <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
            <Reveal>
              <div className="text-center">
                <span className="rounded-full bg-[#17c19a]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#17c19a]">
                  How it works
                </span>
                <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[#111827] sm:text-5xl">
                  From registration to settlement, verified at every step.
                </h2>
                <p className="mt-4 text-lg text-gray-600">
                  Each step builds on the last, guaranteeing verified funds before goods ship.
                </p>
              </div>
            </Reveal>

            <div className="mt-16 space-y-8">
              {steps.map((step) => (
                <div key={step.n} className="sticky top-28">
                  <article className="rounded-3xl border border-gray-200 bg-white p-8 shadow-xl shadow-gray-200/50 sm:p-10">
                    <div className="grid items-center gap-8 sm:grid-cols-[1.1fr_0.9fr]">
                      <div>
                        <div className="flex items-baseline gap-4">
                          <span className="font-mono text-4xl font-extrabold text-[#17c19a]/40 sm:text-5xl">
                            {step.n}
                          </span>
                          <h3 className="text-2xl font-extrabold text-[#111827]">
                            {step.title}
                          </h3>
                        </div>
                        <p className="mt-4 text-base leading-relaxed text-gray-600">
                          {step.body}
                        </p>
                      </div>
                      <div className="sm:justify-self-end">{step.visual}</div>
                    </div>
                  </article>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------- payment ≠ settlement spotlight */}
        <section className="border-t border-gray-200 bg-[#f8faf9] py-24">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="max-w-3xl">
                <span className="rounded-full bg-[#17c19a]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#17c19a]">
                  Protection System
                </span>
                <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[#111827] sm:text-4xl">
                  &ldquo;They paid&rdquo; and &ldquo;I have the money&rdquo; are two different facts.
                </h2>
                <p className="mt-4 text-lg text-gray-600">
                  Most tools stop at &ldquo;transaction successful.&rdquo; Confirmly tracks payment and settlement as separate, verified states.
                </p>
              </div>
            </Reveal>

            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              <Reveal>
                <div className="h-full rounded-2xl border border-[#17c19a]/30 bg-white p-8 shadow-sm">
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#e8f9f5] px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-[#0d8067]">
                    <CheckCircle2 className="h-4 w-4 text-[#17c19a]" aria-hidden />
                    Verified · Payment
                  </span>
                  <h3 className="mt-5 text-xl font-bold text-[#111827]">
                    The customer&apos;s money left their account
                  </h3>
                  <p className="mt-2 leading-relaxed text-gray-600">
                    Established only by a server-side Monnify verification. No client redirect, no screenshot, and no unsigned webhook can set it.
                  </p>
                </div>
              </Reveal>
              <Reveal delay={0.08}>
                <div className="h-full rounded-2xl border border-amber-300 bg-white p-8 shadow-sm">
                  <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-amber-700">
                    <Clock className="h-4 w-4 text-amber-600" aria-hidden />
                    Pending · Settlement
                  </span>
                  <h3 className="mt-5 text-xl font-bold text-[#111827]">
                    Your bank has not been credited yet
                  </h3>
                  <p className="mt-2 leading-relaxed text-gray-600">
                    Stays pending until a Monnify settlement event confirms payout. Your dashboard shows both, so the two are never confused.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ for merchants */}
        <section id="for-merchants" className="py-24 bg-white border-t border-gray-200">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="text-center max-w-3xl mx-auto">
                <span className="rounded-full bg-[#17c19a]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#17c19a]">
                  For Merchants
                </span>
                <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[#111827] sm:text-5xl">
                  A back office for the shop you run from your phone.
                </h2>
              </div>
            </Reveal>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: Store,
                  title: "Catalogue & Variants",
                  body: "Products, aliases, sizes, colours, stock and delivery zones — the single source of truth for every order.",
                },
                {
                  icon: Landmark,
                  title: "Settlement Account",
                  body: "Validated bank account, dedicated Monnify subaccount, masked everywhere, replaceable only with reauthentication.",
                },
                {
                  icon: Users,
                  title: "Conversations",
                  body: "Full transcripts with one-tap human takeover and resume. The bot steps aside the moment you type.",
                },
                {
                  icon: BadgeCheck,
                  title: "Payments & Revenue",
                  body: "Verified revenue, pending settlements and settled amounts — tracked separately, honestly.",
                },
              ].map((f, i) => {
                const Icon = f.icon;
                return (
                  <Reveal key={f.title} delay={(i % 4) * 0.08}>
                    <div className="h-full rounded-2xl border border-gray-200 bg-[#fcfcfc] p-7 shadow-xs transition hover:shadow-md hover:border-[#17c19a]/40">
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#17c19a]/15 text-[#17c19a]">
                        <Icon className="h-6 w-6" aria-hidden />
                      </span>
                      <h3 className="mt-5 text-lg font-bold text-[#111827]">{f.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-gray-600">
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
        <section id="security" className="py-24 bg-[#f8faf9] border-t border-gray-200">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="text-center max-w-3xl mx-auto">
                <span className="rounded-full bg-[#17c19a]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#17c19a]">
                  Security
                </span>
                <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[#111827] sm:text-5xl">
                  Trust, engineered in.
                </h2>
              </div>
            </Reveal>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {trust.map((t, i) => {
                const Icon = t.icon;
                return (
                  <Reveal key={t.title} delay={(i % 3) * 0.08}>
                    <div className="h-full rounded-2xl border border-gray-200 bg-white p-7 shadow-xs transition hover:shadow-md">
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#17c19a]/15 text-[#17c19a]">
                        <Icon className="h-6 w-6" aria-hidden />
                      </span>
                      <h3 className="mt-5 text-lg font-bold text-[#111827]">{t.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-gray-600">
                        {t.body}
                      </p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ FAQ */}
        <section id="faq" className="py-24 bg-white border-t border-gray-200">
          <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
            <Reveal>
              <div className="text-center">
                <span className="rounded-full bg-[#17c19a]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#17c19a]">
                  FAQ
                </span>
                <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[#111827] sm:text-4xl">
                  Frequently Asked Questions
                </h2>
              </div>
            </Reveal>
            <div className="mt-12 divide-y divide-gray-200 border-y border-gray-200">
              {faqs.map((f) => (
                <details key={f.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-6 font-bold text-gray-900 transition hover:text-[#17c19a] text-lg">
                    {f.q}
                    <ChevronDown
                      className="h-5 w-5 shrink-0 text-[#17c19a] transition-transform duration-300 group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <p className="pb-6 pr-8 text-base leading-relaxed text-gray-600">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------- WhatsApp QR */}
        <WhatsAppQr />

        {/* ------------------------------------------------ final CTA */}
        <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#17c19a] via-[#0fa17f] to-[#0d8067] px-6 py-16 text-center text-white shadow-2xl sm:px-12">
              <div className="relative">
                <ConfirmlyMark className="mx-auto h-16 w-16 drop-shadow-md" />
                <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">
                  Start selling with clearer orders and verified payments.
                </h2>
                <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <Link
                    href="/signup"
                    className="inline-flex items-center justify-center rounded-full bg-white px-8 py-4 text-base font-bold text-[#111827] shadow-xl transition hover:bg-gray-100 active:scale-95"
                  >
                    Create Business Account
                  </Link>
                  <Link
                    href="/start"
                    className="inline-flex items-center justify-center rounded-full border-2 border-white/30 bg-white/10 px-8 py-4 text-base font-semibold text-white transition hover:bg-white/20 active:scale-95"
                  >
                    Order from Store on WhatsApp
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ------------------------------------------------ footer */}
      <footer className="border-t border-gray-200 bg-white text-gray-600">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
            <div>
              <ConfirmlyLogo tone="light" />
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-600">
                From chat to confirmed payment. WhatsApp-native ordering with Monnify-verified settlement.
              </p>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-900">
                Product
              </p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {(
                  [
                    ["#how-it-works", "How it works"],
                    ["#for-merchants", "For merchants"],
                    ["#security", "Security"],
                    ["#faq", "FAQ"],
                  ] as const
                ).map(([href, label]) => (
                  <li key={label}>
                    <Link href={href} className="text-gray-600 transition hover:text-[#17c19a]">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-900">
                Get started
              </p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {(
                  [
                    ["/signup", "Create business account"],
                    ["/start", "Order from a store"],
                    ["/login", "Log in"],
                  ] as const
                ).map(([href, label]) => (
                  <li key={label}>
                    <Link href={href} className="text-gray-600 transition hover:text-[#17c19a]">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-900">
                Powered by
              </p>
              <ul className="mt-4 space-y-2.5 text-sm text-gray-600">
                <li>Monnify · payments &amp; settlement</li>
                <li>NVIDIA NIM · order understanding</li>
                <li>WhatsApp Cloud API</li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-gray-200 pt-6 text-sm text-gray-500 sm:flex-row">
            <span>© {new Date().getFullYear()} Confirmly. All rights reserved.</span>
            <span>Payments by Monnify · Orders understood by NVIDIA NIM</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
