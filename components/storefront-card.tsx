"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Megaphone,
  QrCode,
} from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";

export interface StorefrontLink {
  branchId: string;
  storeName: string;
  storeCode: string;
  waLink: string;
  qrDataUrl: string;
}

/** A ready-to-share marketing blurb merchants can paste into a bio or caption. */
function ctaText(storeName: string, waLink: string): string {
  return `🛒 Order from ${storeName} on WhatsApp — browse, pay and track your order right in the chat:\n${waLink}`;
}

export function StorefrontCard({ link }: { link: StorefrontLink }) {
  const [copied, setCopied] = useState<"link" | "cta" | null>(null);

  async function copy(kind: "link" | "cta", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1600);
    } catch {
      // Clipboard can be blocked (insecure context / permissions) — the field
      // is selectable, so the merchant can still copy manually.
      setCopied(null);
    }
  }

  const cta = ctaText(link.storeName, link.waLink);

  return (
    <Card
      title={link.storeName}
      action={<Badge tone="neutral">{link.storeCode}</Badge>}
    >
      <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
        {/* QR */}
        <div className="mx-auto w-full max-w-[220px] sm:mx-0">
          <div className="rounded-2xl border border-ink-900/10 bg-white p-3 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={link.qrDataUrl}
              alt={`QR code that opens a WhatsApp chat with ${link.storeName}`}
              className="h-auto w-full rounded-lg"
              width={320}
              height={320}
            />
          </div>
          <a
            href={link.qrDataUrl}
            download={`confirmly-${link.storeCode.toLowerCase()}-qr.png`}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-ink-900/10 bg-surface-raised px-4 py-2 text-sm font-semibold text-ink-700 transition hover:border-brand-300 hover:text-brand-700"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download QR
          </a>
        </div>

        {/* Link + actions */}
        <div className="min-w-0 space-y-4">
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-700">
              <QrCode className="h-4 w-4 text-brand-600" aria-hidden />
              WhatsApp store link
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={link.waLink}
                onFocus={(e) => e.currentTarget.select()}
                aria-label={`WhatsApp store link for ${link.storeName}`}
                className="w-full min-w-0 rounded-lg border border-ink-900/10 bg-surface px-3 py-2.5 font-mono text-xs text-ink-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => copy("link", link.waLink)}
                  className="shrink-0"
                >
                  {copied === "link" ? (
                    <Check className="h-4 w-4" aria-hidden />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden />
                  )}
                  {copied === "link" ? "Copied" : "Copy"}
                </Button>
                <a
                  href={link.waLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Open
                </a>
              </div>
            </div>
            <p className="mt-1.5 text-xs text-ink-500">
              Anyone who taps or scans lands straight in{" "}
              <span className="font-medium text-ink-700">{link.storeName}</span>{" "}
              — no app install, no store code to type.
            </p>
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-700">
              <Megaphone className="h-4 w-4 text-brand-600" aria-hidden />
              Ready-to-post caption
            </p>
            <div className="rounded-lg border border-ink-900/10 bg-surface p-3">
              <p className="whitespace-pre-line text-sm text-ink-700">{cta}</p>
              <Button
                type="button"
                variant="ghost"
                onClick={() => copy("cta", cta)}
                className="mt-2 px-2 py-1 text-xs"
              >
                {copied === "cta" ? (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                )}
                {copied === "cta" ? "Copied" : "Copy caption"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-5 border-t border-ink-900/5 pt-4 text-xs text-ink-500">
        Put this link in your Instagram / TikTok bio, Google Business profile,
        website button, flyers, receipts and packaging. Print the QR for your
        shopfront, tables or delivery bags.
      </p>
    </Card>
  );
}
