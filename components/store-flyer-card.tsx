"use client";

import { useState } from "react";
import { Download, Share2 } from "lucide-react";
import { Card } from "@/components/ui";

/**
 * Preview + download/share of a branch's "we've joined Confirmly" flyer.
 * Share uses the device share sheet (WhatsApp Status, Instagram, …) where the
 * browser supports sharing files; otherwise the flyer downloads.
 */
export function StoreFlyerCard({
  branchId,
  storeName,
  storeCode,
}: {
  branchId: string;
  storeName: string;
  storeCode: string;
}) {
  const src = `/api/storefront/flyer/${encodeURIComponent(branchId)}`;
  const filename = `confirmly-flyer-${storeCode.toLowerCase()}.png`;
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    setStatus(null);
    try {
      const blob = await fetch(src).then((r) => {
        if (!r.ok) throw new Error("render failed");
        return r.blob();
      });
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${storeName} is on Confirmly`,
          text: `We're now on Confirmly — order from ${storeName} on WhatsApp.`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement("a"), { href: url, download: filename });
        a.click();
        URL.revokeObjectURL(url);
        setStatus("Sharing isn't supported in this browser, so the flyer was downloaded instead.");
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setStatus("Couldn't prepare the flyer. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={`Announcement flyer · ${storeName}`}>
      <div className="grid gap-6 sm:grid-cols-[minmax(0,260px)_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`Flyer announcing ${storeName} on Confirmly, with the store logo and a QR code to order on WhatsApp`}
          width={1080}
          height={1350}
          loading="lazy"
          className="mx-auto h-auto w-full max-w-[260px] rounded-xl border border-ink-900/10 bg-surface shadow-sm"
        />
        <div className="min-w-0 space-y-4">
          <p className="text-sm text-ink-700">
            Tell your customers you&apos;ve joined Confirmly. The flyer carries your logo, your store
            name and a QR code that opens your store in WhatsApp, plus Confirmly&apos;s contact
            details. Post it on WhatsApp Status, Instagram or Facebook, or print it for your shop.
          </p>
          <p className="text-xs text-ink-500">
            Your logo comes from Settings → Store logo. Without one, your initials are used.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={share}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-70"
            >
              <Share2 className="h-4 w-4" aria-hidden />
              {busy ? "Preparing…" : "Share"}
            </button>
            <a
              href={`${src}?download=1`}
              download={filename}
              className="inline-flex items-center gap-2 rounded-lg border border-ink-900/10 bg-surface-raised px-4 py-2 text-sm font-semibold text-ink-700 transition hover:border-brand-300 hover:text-brand-700"
            >
              <Download className="h-4 w-4" aria-hidden />
              Download PNG
            </a>
          </div>
          {status ? (
            <p role="status" className="text-sm text-ink-500">
              {status}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
