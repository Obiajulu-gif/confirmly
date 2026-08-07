import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileWarning,
  Landmark,
  ListChecks,
  Lock,
  Menu,
  MessageCircle,
  MessageSquareText,
  QrCode,
  Receipt,
  ScanLine,
  ShieldCheck,
  Store,
  Users,
  X,
} from "lucide-react";
import { ConfirmlyLogo, ConfirmlyMark } from "@/components/logo";
import { PhoneDemo } from "@/components/phone-demo";
import { Reveal } from "@/components/reveal";
import { WhatsAppQr } from "@/components/whatsapp-qr";

const navLinks = [
  ["#how-it-works", "How it works"],
  ["#for-merchants", "For merchants"],
  ["#security", "Security"],
  ["#faq", "FAQ"],
] as const;

const flowStrip = [
  "WhatsApp order",
  "structured order",
  "Monnify checkout",
  "payment verified",
  "receipt issued",
];

const problems = [
  {
    icon: FileWarning,
    title: "Fake screenshots",
    body: "Edited payment screenshots pass for proof, and goods leave the shop before money ever arrives.",
  },
  {
    icon: MessageSquareText,
    title: "Scattered orders",
    body: "Order details buried across dozens of chats — quantities, sizes and addresses lost in the scroll.",
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
    body: "Sign up, register the business, and add a settlement bank account. Monnify validates the account name and issues a dedicated subaccount. Free — no setup fee.",
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
        START ADASTYLES — abeg give me two black polo, large, bring am come Yaba
      </div>
    ),
  },
  {
    n: "03",
    title: "Confirmly structures the order",
    body: "The AI works out what the customer meant. Your catalogue supplies every price, and the server does the maths. One summary, one explicit confirmation.",
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
    body: "The customer pays a Monnify-generated checkout — never your personal account. Confirmly then asks Monnify directly whether the money arrived. A screenshot can never answer that question.",
    visual: (
      <div className="space-y-2 font-mono text-xs">
        <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-2.5 text-brand-300">
          Monnify says: PAID ✓
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
    body: "Every checkout carries your subaccount, so Monnify settles your share straight to your registered bank account — tracked separately from payment verification.",
    visual: (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 font-mono text-xs text-white/80">
        <div className="flex justify-between gap-6">
          <span>your share</span>
          <span className="text-brand-300">100%</span>
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
    title: "Nobody can fake a payment to you",
    body: "An order is only marked paid when Confirmly has asked Monnify directly and Monnify said yes. Screenshots and “I have sent it” messages change nothing.",
  },
  {
    icon: Store,
    title: "Your prices, never the AI's",
    body: "The AI only works out what the customer wanted. Every price, delivery fee and total comes from your own catalogue — the AI is never allowed to name a figure.",
  },
  {
    icon: Lock,
    title: "Customers never see your bank details",
    body: "Your account number is scrambled in storage, shown only as ••••1234, and never given to a customer as somewhere to pay.",
  },
  {
    icon: ShieldCheck,
    title: "Wrong totals become impossible",
    body: "Every sum is worked out by the server in whole kobo, from your catalogue — so rounding errors and mental-arithmetic mistakes simply cannot happen.",
  },
  {
    icon: ScanLine,
    title: "Every order keeps a receipt trail",
    body: "From first message to settlement, each step is recorded in order with a timestamp. When a customer disputes something, you have the record.",
  },
  {
    icon: QrCode,
    title: "Receipts anyone can check",
    body: "Each receipt carries a QR code. Scanning it says VALID or NOT VALID — so a customer can prove they paid, and nobody can forge one.",
  },
];

const metrics = [
  { value: "₦0", label: "To start. No setup fee, no monthly charge." },
  { value: "0", label: "Screenshots ever accepted as proof of payment" },
  { value: "24/7", label: "Orders taken, priced and confirmed automatically" },
  { value: "1", label: "WhatsApp number serves every branch you run" },
];

const faqs = [
  {
    q: "What does Confirmly cost?",
    a: "It is free to start. No setup fee and no monthly charge — create a business account, add your settlement bank account, and begin taking orders.",
  },
  {
    q: "Do my customers need to download an app?",
    a: "No. Customers order in the WhatsApp thread they already use. They pick your store with a short code, then chat in plain language — nothing to install or learn.",
  },
  {
    q: "How is a payment actually confirmed?",
    a: "Confirmly asks Monnify directly whether the money arrived, and only then marks the order paid. Screenshots, redirects and messages claiming payment are never trusted — the bank rail is the only thing that counts.",
  },
  {
    q: "Where does my money settle?",
    a: "Into your own bank account. Each merchant gets a dedicated Monnify subaccount, and every checkout carries your income split, so Confirmly never holds your money.",
  },
  {
    q: "What does the AI decide?",
    a: "Only what the customer meant — the product, variant, quantity and delivery area. Every price, fee and total comes from your catalogue and is worked out by the server.",
  },
  {
    q: "Can one WhatsApp number serve several branches?",
    a: "Yes. One shared number serves every branch; customers select a branch before ordering, and catalogues, stock and orders stay scoped to that branch.",
  },
  {
    q: "Is my bank information safe?",
    a: "Account numbers are scrambled in storage, shown only masked, and never presented to a customer as a payment destination.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-night-900 text-white">
      {/* ------------------------------------------------ header */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-night-900/95">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Confirmly home">
            <ConfirmlyLogo tone="dark" />
          </Link>

          {/* desktop nav */}
          <nav className="hidden items-center gap-1 lg:flex">
            {navLinks.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition hover:text-white"
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition hover:text-white sm:block"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="cta-glow hidden rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-night-900 transition hover:bg-brand-400 sm:block"
            >
              Start free
            </Link>

            {/* mobile menu — CSS-only disclosure, no client JS */}
            <details className="group relative lg:hidden">
              <summary
                className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-white/15 text-white/80 transition hover:text-white [&::-webkit-details-marker]:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5 group-open:hidden" aria-hidden />
                <X className="hidden h-5 w-5 group-open:block" aria-hidden />
              </summary>
              <nav className="absolute right-0 top-12 z-40 w-60 rounded-2xl border border-white/10 bg-night-800 p-2 shadow-2xl">
                {navLinks.map(([href, label]) => (
                  <Link
                    key={href}
                    href={href}
                    className="block rounded-xl px-4 py-3 text-sm font-medium text-white/75 transition hover:bg-white/5 hover:text-white"
                  >
                    {label}
                  </Link>
                ))}
                <Link
                  href="#chat-on-whatsapp"
                  className="block rounded-xl px-4 py-3 text-sm font-medium text-white/75 transition hover:bg-white/5 hover:text-white"
                >
                  Try it on WhatsApp
                </Link>
                <div className="my-2 border-t border-white/10" />
                <Link
                  href="/login"
                  className="block rounded-xl px-4 py-3 text-sm font-medium text-white/75 transition hover:bg-white/5 hover:text-white"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="mt-1 block rounded-xl bg-brand-500 px-4 py-3 text-center text-sm font-bold text-night-900 transition hover:bg-brand-400"
                >
                  Start free
                </Link>
              </nav>
            </details>
          </div>
        </div>

        {/* Closes the disclosure after an in-page jump. The menu is fully
            functional without this — it just would not close on its own. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "document.addEventListener('click',function(e){var t=e.target;if(!t||!t.closest)return;var a=t.closest('details nav a');if(a)a.closest('details').open=false})",
          }}
        />
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
              <span
                className="anim-fade-up inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-3.5 py-1.5 text-xs font-semibold text-brand-300"
                style={{ "--d": "0.05s" } as React.CSSProperties}
              >
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                Free to start · No setup fee
              </span>

              <h1
                className="anim-fade-up mt-6 text-[2.5rem] font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-[3.9rem]"
                style={{ "--d": "0.15s" } as React.CSSProperties}
              >
                Never ship against a{" "}
                <span className="text-gradient">fake payment screenshot</span>{" "}
                again.
              </h1>

              <p
                className="anim-fade-up mt-6 max-w-xl text-lg leading-relaxed text-white/70"
                style={{ "--d": "0.3s" } as React.CSSProperties}
              >
                Confirmly turns your WhatsApp chats into clear orders, collects
                payment through Monnify, and marks an order paid only when the
                money has actually arrived. No app for your customers, nothing
                new for you to learn.
              </p>

              <div
                className="anim-fade-up mt-9 flex flex-col gap-3 sm:flex-row"
                style={{ "--d": "0.45s" } as React.CSSProperties}
              >
                <Link
                  href="/signup"
                  className="cta-glow inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-500 px-7 py-3.5 text-base font-bold text-night-900 transition hover:bg-brand-400"
                >
                  Start free
                  <ArrowRight className="h-4.5 w-4.5" aria-hidden />
                </Link>
                <Link
                  href="#chat-on-whatsapp"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-7 py-3.5 text-base font-semibold text-white/85 transition hover:border-brand-400/50 hover:text-white"
                >
                  <MessageCircle className="h-4.5 w-4.5" aria-hidden />
                  Try it on WhatsApp
                </Link>
              </div>

              {/* flow strip */}
              <div
                className="anim-fade-up mt-10 flex flex-wrap items-center gap-2 text-[13px] font-medium text-white/65"
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

        {/* --------------- live demo — the strongest proof, so it comes early */}
        <WhatsAppQr />

        {/* ------------------------------------------------ metrics band */}
        <section className="border-y border-white/5 bg-white/[0.015]">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-2 divide-x divide-y divide-white/5 px-0 sm:px-6 lg:grid-cols-4 lg:divide-y-0">
            {metrics.map((m) => (
              <div key={m.label} className="px-4 py-9 text-center sm:py-11">
                <p className="text-gradient text-3xl font-extrabold tracking-tight sm:text-4xl">
                  {m.value}
                </p>
                <p className="mx-auto mt-2 max-w-[15rem] text-xs leading-relaxed text-white/65 sm:text-sm">
                  {m.label}
                </p>
              </div>
            ))}
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
                      <p className="mt-2 text-sm leading-relaxed text-white/65">
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
            </Reveal>

            <div className="mt-16">
              {steps.map((step, i) => (
                <div
                  key={step.n}
                  /* Sticky stacking only where there is vertical room for it —
                     on short viewports the cards would otherwise overlap. */
                  className="mb-8 md:sticky"
                  style={{ top: `${84 + i * 22}px` }}
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
                        <p className="mt-4 max-w-md leading-relaxed text-white/70">
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

        {/* ------------------------------------- payment ≠ settlement spotlight */}
        <section className="border-t border-white/5 bg-white/[0.02] py-24">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <Reveal>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-400">
                The distinction that protects your money
              </p>
              <h2 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl">
                &ldquo;They paid&rdquo; and &ldquo;I have the money&rdquo; are two
                different facts.
              </h2>
              <p className="mt-4 max-w-2xl leading-relaxed text-white/70">
                Most tools stop at &ldquo;transaction successful.&rdquo; Confirmly
                tracks the two separately — so you only ship against money that
                has actually arrived.
              </p>
            </Reveal>

            <div className="mt-12 grid gap-5 lg:grid-cols-2">
              <Reveal>
                <div className="glass-card h-full rounded-2xl border-brand-500/20 p-7">
                  <span className="inline-flex items-center gap-2 rounded-full bg-brand-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-300">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    Verified · Payment
                  </span>
                  <h3 className="mt-4 text-lg font-bold">
                    The customer&apos;s money left their account
                  </h3>
                  <p className="mt-2 leading-relaxed text-white/70">
                    Established only by asking Monnify directly. No screenshot and
                    no message claiming payment can set it.
                  </p>
                </div>
              </Reveal>
              <Reveal delay={0.08}>
                <div className="glass-card h-full rounded-2xl border-amber-400/20 p-7">
                  <span className="inline-flex items-center gap-2 rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-300">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    Pending · Settlement
                  </span>
                  <h3 className="mt-4 text-lg font-bold">
                    Your bank has not been credited yet
                  </h3>
                  <p className="mt-2 leading-relaxed text-white/70">
                    Stays pending until Monnify confirms the payout reached you.
                    Your dashboard shows both, so the two are never confused.
                  </p>
                </div>
              </Reveal>
            </div>

            <Reveal>
              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-5 text-sm text-white/70">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" aria-hidden />
                <p className="leading-relaxed">
                  If a payment notification ever goes missing, Confirmly checks
                  again on a schedule and picks it up — so a hiccup becomes a
                  short delay, never a lost order.
                </p>
              </div>
            </Reveal>
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
              <p className="mt-4 max-w-2xl leading-relaxed text-white/70">
                Everything you need to run verified WhatsApp commerce — catalogue,
                settlement, conversations and reporting — in one dashboard.
              </p>
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
                      <p className="mt-2 text-sm leading-relaxed text-white/65">
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
              <p className="mt-4 max-w-2xl leading-relaxed text-white/70">
                The rules that make a payment real are enforced by the software,
                not by trust — so fraud is designed out, not chased afterwards.
              </p>
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
                      <p className="mt-2 text-sm leading-relaxed text-white/65">
                        {t.body}
                      </p>
                    </div>
                  </Reveal>
                );
              })}
            </div>

            {/* The technical detail still matters — it just shouldn't be the
                first thing a merchant has to read. */}
            <Reveal>
              <details className="group mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-sm font-semibold text-white/80 transition hover:text-white [&::-webkit-details-marker]:hidden">
                  How it works, for the technically minded
                  <ChevronDown
                    className="h-5 w-5 shrink-0 text-brand-400 transition-transform duration-300 group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="grid gap-4 px-6 pb-6 text-sm leading-relaxed text-white/65 sm:grid-cols-2">
                  <p>
                    <strong className="text-white/85">Webhooks are signed.</strong>{" "}
                    Every Monnify and WhatsApp callback is verified against an
                    HMAC-SHA512 signature and rejected with a 401 on mismatch.
                    Events are idempotent, so a replayed delivery is a no-op.
                  </p>
                  <p>
                    <strong className="text-white/85">
                      Verification is server-to-server.
                    </strong>{" "}
                    A signed webhook alone never marks an order paid — Confirmly
                    re-queries the Monnify transaction API and only then writes
                    the state.
                  </p>
                  <p>
                    <strong className="text-white/85">Money is integer kobo.</strong>{" "}
                    All arithmetic is done server-side in whole kobo from
                    PostgreSQL. The AI intent schema has no money fields at all,
                    so an invented price is structurally unrepresentable.
                  </p>
                  <p>
                    <strong className="text-white/85">Secrets stay server-side.</strong>{" "}
                    Settlement bank details are AES-256-GCM encrypted at rest,
                    sessions are bcrypt + HTTP-only JWT, and a pre-push scanner
                    fails the build on any leaked credential.
                  </p>
                </div>
              </details>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------ FAQ */}
        <section id="faq" className="border-t border-white/5 py-24">
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
          />
          <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
            <Reveal>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-400">
                FAQ
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                Questions, answered.
              </h2>
            </Reveal>
            <div className="mt-10 divide-y divide-white/[0.08] border-y border-white/[0.08]">
              {faqs.map((f) => (
                <details key={f.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-semibold text-white/90 transition hover:text-white [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <ChevronDown
                      className="h-5 w-5 shrink-0 text-brand-400 transition-transform duration-300 group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <p className="pb-5 pr-9 leading-relaxed text-white/70">{f.a}</p>
                </details>
              ))}
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
                <p className="mx-auto mt-4 max-w-md text-white/70">
                  Free to start. No setup fee, no monthly charge — just add your
                  catalogue and your settlement account.
                </p>
                <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    href="/signup"
                    className="cta-glow inline-flex items-center justify-center rounded-2xl bg-brand-500 px-7 py-3.5 text-base font-bold text-night-900 transition hover:bg-brand-400"
                  >
                    Start free
                  </Link>
                  <Link
                    href="#chat-on-whatsapp"
                    className="inline-flex items-center justify-center rounded-2xl border border-white/15 px-7 py-3.5 text-base font-semibold text-white/85 transition hover:border-brand-400/50 hover:text-white"
                  >
                    See it work first
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ------------------------------------------------ footer */}
      <footer className="border-t border-white/5 bg-white/[0.015]">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
            <div>
              <ConfirmlyLogo tone="dark" />
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">
                From chat to confirmed payment. WhatsApp-native ordering with
                Monnify-verified settlement.
              </p>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/55">
                Product
              </p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {navLinks.map(([href, label]) => (
                  <li key={label}>
                    <Link href={href} className="text-white/65 transition hover:text-white">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/55">
                Get started
              </p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {(
                  [
                    ["/signup", "Start free"],
                    ["#chat-on-whatsapp", "Try it on WhatsApp"],
                    ["/start", "Order from a store"],
                    ["/login", "Log in"],
                  ] as const
                ).map(([href, label]) => (
                  <li key={label}>
                    <Link href={href} className="text-white/65 transition hover:text-white">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/55">
                Powered by
              </p>
              <ul className="mt-4 space-y-2.5 text-sm text-white/65">
                <li>Monnify · payments &amp; settlement</li>
                <li>NVIDIA NIM · order understanding</li>
                <li>WhatsApp Cloud API</li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/[0.08] pt-6 text-sm text-white/60 sm:flex-row">
            <span>© {new Date().getFullYear()} Confirmly. All rights reserved.</span>
            <span>Payments by Monnify · Orders understood by NVIDIA NIM</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
