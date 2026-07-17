import Link from "next/link";
import { ConfirmlyLogo, ConfirmlyMark } from "@/components/logo";
import { PhoneDemo } from "@/components/phone-demo";
import { Reveal } from "@/components/reveal";

const steps = [
  {
    n: "01",
    title: "Chat like always",
    body: "Your customer sends a normal WhatsApp message — English, Pidgin, voice-of-the-street. No app to download, no forms.",
    visual: (
      <div className="rounded-2xl rounded-br-md bg-[#d7fbe4] px-4 py-3 text-sm text-ink-900 shadow-lg">
        I need two black polo shirts, large size, delivered to Yaba 🙏
      </div>
    ),
  },
  {
    n: "02",
    title: "AI structures the order",
    body: "NVIDIA NIM turns free text into structured intent, matched against your real catalogue with a confidence policy. It never invents products or prices.",
    visual: (
      <pre className="overflow-x-auto rounded-2xl border border-brand-500/25 bg-night-900/80 px-4 py-3 font-mono text-xs leading-relaxed text-brand-300">
        {`{ "intent": "PLACE_ORDER",
  "items": [{ "searchTerm": "polo",
    "quantity": 2, "size": "L",
    "colour": "black" }],
  "deliveryArea": "Yaba" }`}
      </pre>
    ),
  },
  {
    n: "03",
    title: "Server does the maths",
    body: "Prices and delivery fees come from your database, in integer kobo, on the server. One clear summary, one explicit confirmation — nothing moves without it.",
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
    title: "Monnify verifies payment",
    body: "A secure payment link lands in chat. The webhook is signature-checked, then the transaction is re-verified server-to-server. Only that can mark an order paid.",
    visual: (
      <div className="space-y-2 font-mono text-xs">
        <div className="flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-2.5 text-brand-300">
          🔏 monnify-signature · HMAC-SHA512 ✓
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-2.5 text-brand-300">
          🔁 GET /v2/transactions/… → PAID ✓
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-red-300">
          📸 screenshot.jpg → REJECTED ✗
        </div>
      </div>
    ),
  },
  {
    n: "05",
    title: "Receipt, sealed",
    body: "A verifiable receipt with a QR code goes to the customer, your dashboard timeline updates instantly, and anyone can check it — VALID or NOT VALID.",
    visual: (
      <div className="flex items-center gap-4 rounded-2xl bg-white px-5 py-4 text-ink-900 shadow-xl">
        <div className="grid grid-cols-4 gap-0.5" aria-hidden="true">
          {[1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1].map((on, i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-[2px] ${on ? "bg-ink-900" : "bg-ink-900/15"}`}
            />
          ))}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">
            Valid Confirmly receipt
          </p>
          <p className="font-mono text-sm font-semibold">
            CFY-8K2MHQ4T · ₦26,500
          </p>
        </div>
      </div>
    ),
  },
];

const features = [
  {
    icon: "🛡️",
    title: "No more screenshot 'payments'",
    body: "Payment claims and screenshots are never trusted. Every kobo is confirmed against Monnify's servers before an order moves.",
  },
  {
    icon: "🎯",
    title: "One question at a time",
    body: "Ambiguous order? Confirmly asks exactly one focused question — size, colour, or area — never a wall of forms.",
  },
  {
    icon: "🙋",
    title: "Human takeover, anytime",
    body: "Type “human” and the bot steps aside instantly. Merchants can pause automation per conversation from the dashboard.",
  },
  {
    icon: "🧾",
    title: "Receipts anyone can verify",
    body: "Every receipt carries a high-entropy token and QR code. Scan it — VALID or NOT VALID, no arguments.",
  },
  {
    icon: "🗂️",
    title: "Dispute-ready audit trail",
    body: "From first message to receipt delivery, every step is recorded in a chronological, tamper-evident timeline.",
  },
  {
    icon: "🇳🇬",
    title: "Speaks Nigerian",
    body: "“Abeg give me three polo, bring am come Yaba” parses perfectly — but products and prices only ever come from your catalogue.",
  },
];

const ticker = [
  "Signed webhooks",
  "Server-verified payments",
  "Integer-kobo money math",
  "Idempotent events",
  "QR receipts",
  "Human handover",
  "Catalogue-grounded AI",
  "Audit timelines",
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
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              href="#how-it-works"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition hover:text-white sm:block"
            >
              How it works
            </Link>
            <Link
              href="/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition hover:text-white sm:block"
            >
              Merchant login
            </Link>
            <Link
              href="/start"
              className="cta-glow rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-night-900 transition hover:bg-brand-400"
            >
              Order on WhatsApp
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* ------------------------------------------------ hero */}
        <section className="relative overflow-hidden">
          {/* ambient orbs + grid */}
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
                WhatsApp × Monnify × NVIDIA NIM
              </p>

              <h1
                className="anim-fade-up mt-6 text-[2.6rem] font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-[4.2rem]"
                style={{ "--d": "0.15s" } as React.CSSProperties}
              >
                From chat to{" "}
                <span className="text-gradient">confirmed payment.</span>
              </h1>

              <p
                className="anim-fade-up mt-6 max-w-xl text-lg leading-relaxed text-white/60"
                style={{ "--d": "0.3s" } as React.CSSProperties}
              >
                Confirmly turns WhatsApp conversations into structured,
                payment-ready orders, verifies every payment through Monnify,
                and seals it with a receipt anyone can verify — so you never
                fulfil an unpaid order again.
              </p>

              <div
                className="anim-fade-up mt-9 flex flex-col gap-3 sm:flex-row"
                style={{ "--d": "0.45s" } as React.CSSProperties}
              >
                <Link
                  href="/start"
                  className="cta-glow inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-500 px-7 py-3.5 text-base font-bold text-night-900 transition hover:bg-brand-400"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.4 14.1c-.2.7-1.3 1.3-1.9 1.4-.5.1-1.1.2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.9 2.1c.1.2.1.4 0 .6l-.4.6-.5.5c-.2.2-.3.4-.1.7.2.3.9 1.5 2 2.4 1.4 1.2 2.5 1.6 2.9 1.7.3.1.5.1.7-.1l1-1.1c.2-.3.5-.3.7-.2l2.2 1c.3.2.5.3.6.4 0 .1 0 .7-.2 1Z" />
                  </svg>
                  Start an order on WhatsApp
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center rounded-2xl border border-white/15 px-7 py-3.5 text-base font-semibold text-white/85 transition hover:border-brand-400/50 hover:text-white"
                >
                  Open merchant dashboard
                </Link>
              </div>

              <div
                className="anim-fade-up mt-4"
                style={{ "--d": "0.55s" } as React.CSSProperties}
              >
                <Link
                  href="#how-it-works"
                  className="text-sm font-medium text-white/50 underline-offset-4 transition hover:text-brand-300 hover:underline"
                >
                  See how it works <span aria-hidden="true">↓</span>
                </Link>
              </div>

              {/* stats */}
              <dl
                className="anim-fade-up mt-12 grid max-w-md grid-cols-3 gap-4"
                style={{ "--d": "0.7s" } as React.CSSProperties}
              >
                {[
                  ["0", "screenshots trusted"],
                  ["1", "question at a time"],
                  ["100%", "server-verified"],
                ].map(([value, label]) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <dt className="text-2xl font-extrabold text-brand-300">
                      {value}
                    </dt>
                    <dd className="mt-1 text-[11px] uppercase tracking-wide text-white/45">
                      {label}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* phone */}
            <div
              className="anim-fade-up relative"
              style={{ "--d": "0.5s" } as React.CSSProperties}
            >
              <PhoneDemo />
            </div>
          </div>

          {/* ticker */}
          <div className="relative border-y border-white/5 bg-white/[0.02] py-3.5">
            <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
              <div className="flex w-max animate-marquee gap-10 whitespace-nowrap">
                {[...ticker, ...ticker].map((item, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-2.5 text-sm font-medium text-white/45"
                  >
                    <span className="text-brand-400">✦</span>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ------------------- how it works — stacked sticky scroll cards */}
        <section id="how-it-works" className="relative py-24">
          <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
            <Reveal>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-400">
                The flow
              </p>
              <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">
                Five steps from a casual message to verified money.
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
                    {/* stacked-edge indicator */}
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

        {/* ------------------------------------------------ features */}
        <section className="relative py-10 pb-24">
          <div className="orb pointer-events-none absolute inset-x-0 top-0 mx-auto h-[400px] max-w-4xl" />
          <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
            <Reveal>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-400">
                Built for the real market
              </p>
              <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">
                Commerce the way Nigeria actually does it.
              </h2>
            </Reveal>
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f, i) => (
                <Reveal key={f.title} delay={(i % 3) * 0.1}>
                  <div className="lift-card glass-card h-full rounded-2xl p-6">
                    <span className="text-2xl">{f.icon}</span>
                    <h3 className="mt-4 font-bold">{f.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/55">
                      {f.body}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ security banner */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-brand-500/25 bg-gradient-to-br from-night-700 via-night-800 to-night-900 px-6 py-14 text-center sm:px-12">
              <div className="night-grid pointer-events-none absolute inset-0" />
              <div className="relative">
                <ConfirmlyMark className="mx-auto h-14 w-14" />
                <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
                  A screenshot is not a receipt.
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-white/60">
                  Confirmly checks every payment against Monnify&apos;s servers
                  before your order moves. Signed webhooks, idempotent events,
                  verifiable receipts — trust, engineered in.
                </p>
                <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    href="/start"
                    className="cta-glow inline-flex items-center justify-center rounded-2xl bg-brand-500 px-7 py-3.5 text-base font-bold text-night-900 transition hover:bg-brand-400"
                  >
                    Try a live order
                  </Link>
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center justify-center rounded-2xl border border-white/15 px-7 py-3.5 text-base font-semibold text-white/85 transition hover:border-brand-400/50 hover:text-white"
                  >
                    Open merchant dashboard
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
            © {new Date().getFullYear()} Confirmly · Payments verified by
            Monnify · Orders understood by NVIDIA NIM
          </span>
        </div>
      </footer>
    </div>
  );
}
