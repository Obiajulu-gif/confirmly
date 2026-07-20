import QRCode from "qrcode";
import { MessageCircle, ScanLine, ShieldCheck } from "lucide-react";
import { resolveWhatsAppPublicNumber } from "@/lib/whatsapp/client";
import { Reveal } from "@/components/reveal";

/** "Hi" is a directory command, so a scan lands straight on the store list. */
const GREETING = "Hi";

function formatNumber(digits: string): string {
  // +234 704 486 0938
  if (digits.length === 13 && digits.startsWith("234")) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return `+${digits}`;
}

/**
 * Landing-page entry point for customers: scan on desktop, tap on mobile.
 * Renders nothing when no WhatsApp number is configured, so the page never
 * shows a dead QR code.
 */
export async function WhatsAppQr() {
  const digits = await resolveWhatsAppPublicNumber().catch(() => null);
  if (!digits) return null;

  const waLink = `https://wa.me/${digits}?text=${encodeURIComponent(GREETING)}`;
  const qrDataUrl = await QRCode.toDataURL(waLink, {
    width: 320,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#071019", light: "#ffffff" },
  });

  return (
    <section
      id="chat-on-whatsapp"
      className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6"
    >
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-brand-500/25 bg-gradient-to-br from-night-700 via-night-800 to-night-900 px-6 py-12 sm:px-12">
          <div className="night-grid pointer-events-none absolute inset-0" />
          <div className="relative grid items-center gap-10 md:grid-cols-[auto_1fr]">
            {/* QR card — white plate keeps the code scannable on the dark page */}
            <div className="mx-auto w-full max-w-[248px]">
              <div className="rounded-3xl bg-white p-4 shadow-[0_20px_60px_-20px_rgba(16,185,129,0.45)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt={`QR code that opens a WhatsApp chat with Confirmly on ${formatNumber(digits)}`}
                  className="h-auto w-full rounded-xl"
                  width={320}
                  height={320}
                />
              </div>
              <p className="mt-3 text-center text-xs font-medium text-white/45">
                Point your camera here
              </p>
            </div>

            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-300">
                <ScanLine className="h-3.5 w-3.5" />
                Scan to order
              </span>
              <h2 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">
                Start an order on WhatsApp
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-white/60">
                Scan the code with your phone camera, or tap the button below on
                mobile. Confirmly replies with the list of stores — pick one and
                order right inside the chat.
              </p>

              <dl className="mt-6">
                <dt className="text-xs font-semibold uppercase tracking-wider text-white/40">
                  Business number
                </dt>
                <dd className="mt-1 font-mono text-xl font-bold text-white">
                  {formatNumber(digits)}
                </dd>
              </dl>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cta-glow inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-500 px-7 py-3.5 text-base font-bold text-night-900 transition hover:bg-brand-400"
                >
                  <MessageCircle className="h-5 w-5" />
                  Chat on WhatsApp
                </a>
                <span className="inline-flex items-center gap-2 text-sm text-white/45">
                  <ShieldCheck className="h-4 w-4 text-brand-400" />
                  Payments verified by Monnify
                </span>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
