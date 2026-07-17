import Link from "next/link";
import { findReceiptByToken } from "@/lib/receipts";
import { formatNaira } from "@/lib/money";
import { ConfirmlyLogo } from "@/components/logo";

export const dynamic = "force-dynamic";

/**
 * Public receipt verification. Either VALID CONFIRMLY RECEIPT or
 * RECEIPT NOT VALID — nothing sensitive is revealed on failure.
 */
export default async function VerifyReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const receipt = await findReceiptByToken(token);
  const valid =
    receipt !== null &&
    receipt.revokedAt === null &&
    (receipt.order.state === "PAID" || receipt.order.state === "COMPLETED");

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-4 py-8">
      <ConfirmlyLogo className="mb-8" />
      {valid && receipt ? (
        <div className="w-full rounded-card border-2 border-brand-500 bg-brand-50 p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-3xl text-white">
            ✓
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-brand-800">
            VALID CONFIRMLY RECEIPT
          </h1>
          <dl className="mt-6 space-y-2 text-left text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500">Merchant</dt>
              <dd className="font-semibold text-ink-900">
                {receipt.order.merchant.name}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Order</dt>
              <dd className="font-mono font-semibold text-ink-900">
                {receipt.order.reference}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Amount paid</dt>
              <dd className="font-semibold text-ink-900">
                {formatNaira(receipt.order.totalKobo)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Paid on</dt>
              <dd className="font-semibold text-ink-900">
                {receipt.order.paidAt
                  ? new Date(receipt.order.paidAt).toLocaleString("en-NG", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "—"}
              </dd>
            </div>
          </dl>
          <Link
            href={`/receipt/${receipt.token}`}
            className="mt-6 inline-block rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            View full receipt
          </Link>
        </div>
      ) : (
        <div className="w-full rounded-card border-2 border-red-400 bg-red-50 p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-3xl text-white">
            ✕
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-red-700">
            RECEIPT NOT VALID
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-red-800">
            This link does not correspond to a valid, unrevoked Confirmly
            receipt for a verified payment. If someone sent you this as proof
            of payment, do not release goods.
          </p>
        </div>
      )}
      <Link href="/" className="mt-8 text-sm font-medium text-ink-500 underline">
        What is Confirmly?
      </Link>
    </div>
  );
}
