import Link from "next/link";
import { ConfirmlyLogo, ConfirmlyMark } from "@/components/logo";

const steps = [
  {
    title: "Customer chats on WhatsApp",
    body: "“I need two black polo shirts, large size, delivered to Yaba.” Confirmly receives the message through the WhatsApp Cloud API.",
  },
  {
    title: "AI extracts a structured order",
    body: "NVIDIA NIM turns free text into structured intent. Confirmly matches it against your real catalogue — the AI never invents products or prices.",
  },
  {
    title: "Server calculates the total",
    body: "Prices and delivery fees come from your database, in kobo, on the server. The customer confirms a clear order summary before anything is charged.",
  },
  {
    title: "Monnify verifies the payment",
    body: "A secure Monnify payment link is sent in chat. Only a server-verified Monnify transaction can mark the order paid — never a screenshot.",
  },
  {
    title: "A trusted receipt is issued",
    body: "The customer gets a verifiable digital receipt with a QR code, and your dashboard timeline updates instantly.",
  },
];

const features = [
  {
    title: "No more screenshot 'payments'",
    body: "Payment claims and screenshots are never trusted. Every order is confirmed against Monnify's servers before it is marked paid.",
  },
  {
    title: "One clarification at a time",
    body: "When an order is ambiguous, Confirmly asks exactly one focused question instead of overwhelming your customer.",
  },
  {
    title: "Human takeover, anytime",
    body: "Type “human” and the bot steps aside. Merchants can pause automation per conversation from the dashboard.",
  },
  {
    title: "Audit trail for every order",
    body: "From first message to receipt delivery, every step is recorded in a chronological, dispute-ready timeline.",
  },
  {
    title: "Catalogue-grounded AI",
    body: "Understands Nigerian English and common Pidgin, but products, prices and delivery fees only ever come from your catalogue.",
  },
  {
    title: "Verifiable receipts",
    body: "Every receipt carries a high-entropy token and QR code that anyone can check at a public verification page.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-ink-900/5 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Confirmly home">
            <ConfirmlyLogo />
          </Link>
          <nav className="flex items-center gap-3">
            <Link
              href="#how-it-works"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-brand-50 sm:block"
            >
              How it works
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              Merchant login
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700 ring-1 ring-brand-200">
              WhatsApp × Monnify × NVIDIA NIM
            </p>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-ink-900 sm:text-6xl">
              From chat to confirmed payment.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-500">
              Confirmly converts WhatsApp conversations into structured,
              payment-ready orders, verifies payment through Monnify, and sends
              a trusted digital receipt — so you never fulfil an unpaid order
              again.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-700"
              >
                Open merchant dashboard
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex items-center justify-center rounded-xl border border-ink-900/10 bg-surface-raised px-6 py-3 text-base font-semibold text-ink-700 transition hover:border-brand-300 hover:text-brand-700"
              >
                See how it works
              </Link>
            </div>
          </div>

          {/* Chat mock */}
          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            <div className="rounded-card border border-ink-900/5 bg-surface-raised p-5 shadow-sm">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-ink-500">
                The conversation
              </p>
              <div className="space-y-3 text-sm">
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-ink-900/5 px-4 py-3">
                  I need two black polo shirts, large size, delivered to Yaba.
                </div>
                <div className="ml-auto max-w-[85%] whitespace-pre-line rounded-2xl rounded-tr-sm bg-brand-50 px-4 py-3 ring-1 ring-brand-200">
                  {`I found this order:

2 × Classic Polo Shirt
Black / Large — NGN 24,000

Delivery to Yaba — NGN 2,500

TOTAL: NGN 26,500`}
                </div>
                <div className="ml-auto flex max-w-[85%] flex-wrap justify-end gap-2">
                  <span className="rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">
                    Confirm order
                  </span>
                  <span className="rounded-full border border-ink-900/10 px-3 py-1.5 text-xs font-semibold text-ink-700">
                    Edit order
                  </span>
                  <span className="rounded-full border border-ink-900/10 px-3 py-1.5 text-xs font-semibold text-ink-700">
                    Talk to merchant
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-card border border-ink-900/5 bg-surface-raised p-5 shadow-sm">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-ink-500">
                What your dashboard sees
              </p>
              <ol className="space-y-3">
                {[
                  ["Customer message received", "12:01"],
                  ["Order intent extracted", "12:01"],
                  ["Product matched: Classic Polo Shirt", "12:01"],
                  ["Customer confirmed order", "12:03"],
                  ["Monnify invoice created", "12:03"],
                  ["Webhook received and verified", "12:07"],
                  ["Order marked PAID", "12:07"],
                  ["Receipt sent on WhatsApp", "12:07"],
                ].map(([label, time]) => (
                  <li key={label} className="flex items-center gap-3 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">
                      ✓
                    </span>
                    <span className="flex-1 text-ink-700">{label}</span>
                    <span className="text-xs tabular-nums text-ink-500">
                      {time}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          className="border-y border-ink-900/5 bg-surface-raised py-16 sm:py-20"
        >
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
              How it works
            </h2>
            <p className="mt-3 max-w-2xl text-ink-500">
              Five steps from a casual chat message to a verified, receipted
              payment.
            </p>
            <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
              {steps.map((step, i) => (
                <li
                  key={step.title}
                  className="rounded-card border border-ink-900/5 bg-surface p-5"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 font-semibold text-ink-900">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-500">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
              Built for how Nigerian commerce actually happens
            </h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="rounded-card border border-ink-900/5 bg-surface-raised p-6 shadow-sm"
                >
                  <h3 className="font-semibold text-ink-900">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-500">
                    {f.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="pb-20">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="rounded-card bg-ink-900 px-6 py-12 text-center sm:px-12">
              <ConfirmlyMark className="mx-auto h-12 w-12" />
              <h2 className="mt-6 text-3xl font-bold tracking-tight text-white">
                Stop matching bank alerts by hand.
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-white/70">
                Confirmly checks every payment against Monnify before your
                order moves — screenshots don&apos;t count.
              </p>
              <Link
                href="/dashboard"
                className="mt-8 inline-flex items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-base font-semibold text-white transition hover:bg-brand-400"
              >
                Open merchant dashboard
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-900/5 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-ink-500 sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} Confirmly. Hackathon build.</span>
          <span>
            Payments verified by Monnify · Orders understood by NVIDIA NIM
          </span>
        </div>
      </footer>
    </div>
  );
}
