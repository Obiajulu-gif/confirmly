import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ShieldCheck } from "lucide-react";
import { findReceiptByIdOrToken, receiptVerifyUrl } from "@/lib/receipts";
import { ConfirmlyLogo } from "@/components/logo";

export const dynamic = "force-dynamic";

export default async function ReceiptViewerPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const { receiptId } = await params;
  const receipt = await findReceiptByIdOrToken(receiptId);

  if (!receipt) notFound();

  const imageUrl = `/api/receipts/${receipt.id}?format=png`;
  const verifyUrl = receiptVerifyUrl(receipt.token);

  return (
    <main className="min-h-screen bg-[#071019] px-4 py-8 text-white">
      <div className="mx-auto flex max-w-xl flex-col items-center">
        {/* Header navigation */}
        <div className="w-full flex items-center justify-between mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
            aria-label="Confirmly home"
          >
            <ArrowLeft className="h-4 w-4" />
            <ConfirmlyLogo tone="dark" className="h-7" />
          </Link>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="h-3.5 w-3.5" />
            Verified Authentic
          </div>
        </div>

        {/* Branded Receipt Image Card */}
        <div className="w-full overflow-hidden rounded-2xl bg-white shadow-2xl border border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={`Confirmly receipt for order ${receipt.order.reference}`}
            width={1024}
            height={1536}
            className="w-full h-auto block select-none"
          />
        </div>

        {/* Action Controls */}
        <div className="mt-6 w-full flex flex-col sm:flex-row gap-3">
          <a
            href={imageUrl}
            download={`confirmly_receipt_${receipt.order.reference}.png`}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3.5 text-sm font-bold text-[#071019] hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
          >
            <Download className="h-4 w-4" />
            Download Receipt (PNG)
          </a>
          <Link
            href={verifyUrl}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-5 py-3.5 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
          >
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Verify Authenticity
          </Link>
        </div>

        <div className="mt-8 flex flex-col items-center gap-2">
          <Link href="/" aria-label="Confirmly home">
            <ConfirmlyLogo tone="dark" className="h-6 opacity-75 hover:opacity-100 transition-opacity" />
          </Link>
          <p className="text-center text-xs text-gray-400">
            Issued by {receipt.order.merchant.name} · Verified by Confirmly
          </p>
        </div>
      </div>
    </main>
  );
}
