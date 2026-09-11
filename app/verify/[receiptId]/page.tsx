import Link from "next/link";
import { BadgeCheck, ShieldAlert, SearchX, Download, Eye } from "lucide-react";
import { findReceiptByIdOrToken } from "@/lib/receipts";
import { formatCurrency, formatReceiptDate } from "@/lib/receipts/formatReceiptData";
import { ConfirmlyLogo } from "@/components/logo";

export const dynamic = "force-dynamic";

export default async function VerifyReceiptPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const { receiptId } = await params;
  const receipt = await findReceiptByIdOrToken(receiptId);

  const revoked = receipt !== null && receipt.revokedAt !== null;
  const valid =
    receipt !== null &&
    !revoked &&
    (receipt.order.state === "PAID" || receipt.order.state === "COMPLETED");

  return (
    <main className="min-h-screen bg-[#fafaf8] px-4 py-12 text-[#16232e]">
      <div className="mx-auto flex max-w-lg flex-col items-center">
        <Link href="/" className="mb-8 hover:opacity-80 transition-opacity">
          <ConfirmlyLogo />
        </Link>

        {valid && receipt ? (
          <div className="w-full overflow-hidden rounded-2xl border-2 border-emerald-500 bg-white p-8 shadow-sm text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-inner">
              <BadgeCheck className="h-9 w-9" aria-hidden />
            </div>

            <h1 className="mt-4 text-2xl font-black tracking-tight text-emerald-800">
              ✓ RECEIPT VERIFIED
            </h1>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-emerald-600">
              This receipt is authentic
            </p>

            <div className="my-6 border-t border-dashed border-emerald-200" />

            <dl className="space-y-3.5 text-left text-sm">
              <div className="flex justify-between items-baseline border-b border-gray-100 pb-2">
                <dt className="text-gray-500 font-medium">Store</dt>
                <dd className="font-bold text-gray-900 text-right max-w-[65%]">
                  {receipt.order.merchant.name}
                </dd>
              </div>

              <div className="flex justify-between items-baseline border-b border-gray-100 pb-2">
                <dt className="text-gray-500 font-medium">Customer</dt>
                <dd className="font-semibold text-gray-900 text-right">
                  {receipt.order.customer.name || "WhatsApp Customer"}
                </dd>
              </div>

              <div className="flex justify-between items-baseline border-b border-gray-100 pb-2">
                <dt className="text-gray-500 font-medium">Order Reference</dt>
                <dd className="font-mono font-bold text-gray-900 tracking-wider">
                  {receipt.order.reference}
                </dd>
              </div>

              <div className="flex justify-between items-baseline border-b border-gray-100 pb-2">
                <dt className="text-gray-500 font-medium">Amount</dt>
                <dd className="font-extrabold text-emerald-700 text-base">
                  {formatCurrency(receipt.order.totalKobo, receipt.order.merchant.currency)}
                </dd>
              </div>

              <div className="flex justify-between items-baseline border-b border-gray-100 pb-2">
                <dt className="text-gray-500 font-medium">Payment Status</dt>
                <dd className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  {receipt.order.payment?.settlement?.state === "SETTLED"
                    ? "Settled"
                    : "Verified / Paid"}
                </dd>
              </div>

              <div className="flex justify-between items-baseline">
                <dt className="text-gray-500 font-medium">Issued</dt>
                <dd className="font-semibold text-gray-800 text-right">
                  {formatReceiptDate(receipt.order.paidAt || receipt.issuedAt)}
                </dd>
              </div>
            </dl>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                href={`/receipts/${receipt.id}`}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 transition-colors shadow-sm"
              >
                <Eye className="h-4 w-4" />
                View Receipt
              </Link>
              <a
                href={`/api/receipts/${receipt.id}?format=png`}
                download={`receipt_${receipt.order.reference}.png`}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Download className="h-4 w-4" />
                Download PNG
              </a>
            </div>
          </div>
        ) : revoked ? (
          <div className="w-full rounded-2xl border-2 border-amber-400 bg-amber-50/50 p-8 shadow-sm text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500 text-white">
              <ShieldAlert className="h-9 w-9" aria-hidden />
            </div>
            <h1 className="mt-4 text-2xl font-black tracking-tight text-amber-800">
              ⚠ RECEIPT REVOKED
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-amber-900">
              This receipt was issued but has since been revoked by the merchant or Confirmly.
              This receipt is no longer valid.
            </p>
          </div>
        ) : (
          <div className="w-full rounded-2xl border-2 border-red-300 bg-red-50/50 p-8 shadow-sm text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white">
              <SearchX className="h-9 w-9" aria-hidden />
            </div>
            <h1 className="mt-4 text-2xl font-black tracking-tight text-red-800">
              ✕ RECEIPT NOT FOUND
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-red-900">
              This link does not correspond to any Confirmly receipt for a verified payment.
              If someone provided this as proof of payment, do not release goods or services.
            </p>
          </div>
        )}

        <div className="mt-8 text-center text-xs text-gray-500">
          <p>Confirmly Official Digital Receipt Verification</p>
          <p className="mt-1">Cryptographically authenticated and tamper-protected</p>
        </div>
      </div>
    </main>
  );
}
