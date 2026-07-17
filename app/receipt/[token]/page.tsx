import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { findReceiptByToken, maskReference, receiptVerifyUrl } from "@/lib/receipts";
import { formatNaira } from "@/lib/money";
import { ConfirmlyMark } from "@/components/logo";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Public receipt page. Reached only via the high-entropy token. Shows no
 * database ids, no raw provider payloads, no secrets.
 */
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const receipt = await findReceiptByToken(token);
  if (!receipt) notFound();

  const { order } = receipt;
  const revoked = receipt.revokedAt !== null;
  const verifyUrl = receiptVerifyUrl(receipt.token);
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    width: 160,
    margin: 1,
    color: { dark: "#064e3b", light: "#ffffff" },
  });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-8">
      <div className="rounded-card border border-ink-900/5 bg-surface-raised shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-dashed border-ink-900/10 p-6">
          <div className="flex items-center gap-3">
            <ConfirmlyMark className="h-10 w-10" />
            <div>
              <p className="font-bold text-ink-900">{order.merchant.name}</p>
              <p className="text-xs text-ink-500">Digital receipt</p>
            </div>
          </div>
          <Badge tone={revoked ? "danger" : "success"}>
            {revoked ? "REVOKED" : "PAID"}
          </Badge>
        </div>

        {/* Body */}
        <div className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-500">
                Order reference
              </p>
              <p className="font-mono font-semibold text-ink-900">
                {order.reference}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-500">
                Customer
              </p>
              <p className="font-semibold text-ink-900">
                {order.customer.name ?? "WhatsApp customer"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-500">
                Paid on
              </p>
              <p className="font-semibold text-ink-900">
                {order.paidAt
                  ? new Date(order.paidAt).toLocaleString("en-NG", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-500">
                Payment method
              </p>
              <p className="font-semibold text-ink-900">
                {order.payment?.method ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-500">
                Provider reference
              </p>
              <p className="font-mono font-semibold text-ink-900">
                {maskReference(
                  order.payment?.transactionReference ??
                    order.payment?.invoiceReference
                )}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-500">
                Settlement
              </p>
              <p className="font-semibold text-ink-900">
                {order.payment?.settlement?.state === "SETTLED"
                  ? "Settled"
                  : order.payment?.settlement
                    ? "Pending"
                    : "—"}
              </p>
            </div>
          </div>

          <ul className="space-y-2 border-t border-ink-900/5 pt-4">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 text-sm">
                <span className="text-ink-700">
                  {item.quantity} × {item.productNameSnapshot}
                  {item.variantSnapshot ? (
                    <span className="text-ink-500">
                      {" "}
                      ({item.variantSnapshot})
                    </span>
                  ) : null}
                </span>
                <span className="font-medium tabular-nums">
                  {formatNaira(item.lineTotalKobo)}
                </span>
              </li>
            ))}
            <li className="flex justify-between gap-3 text-sm">
              <span className="text-ink-700">
                {order.deliveryMethod === "PICKUP"
                  ? "Pickup"
                  : `Delivery${order.deliveryZone ? ` — ${order.deliveryZone}` : ""}`}
              </span>
              <span className="font-medium tabular-nums">
                {formatNaira(order.deliveryFeeKobo)}
              </span>
            </li>
          </ul>

          <div className="flex justify-between border-t border-ink-900/5 pt-4">
            <span className="font-semibold text-ink-900">Total paid</span>
            <span className="text-xl font-bold tabular-nums text-brand-700">
              {formatNaira(order.totalKobo)}
            </span>
          </div>
        </div>

        {/* Verification */}
        <div className="flex items-center gap-4 rounded-b-card border-t border-dashed border-ink-900/10 bg-surface p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="QR code linking to the receipt verification page"
            className="h-24 w-24 rounded-lg border border-ink-900/10 bg-white p-1"
          />
          <div className="text-xs leading-relaxed text-ink-500">
            <p className="font-semibold text-ink-700">
              Verify this receipt
            </p>
            <p className="mt-1">
              Scan the QR code or visit the verification page to confirm this
              receipt was issued by Confirmly and has not been revoked.
            </p>
            <Link
              href={`/verify/receipt/${receipt.token}`}
              className="mt-2 inline-block font-semibold text-brand-700 underline"
            >
              Open verification page
            </Link>
          </div>
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-ink-500">
        Issued {new Date(receipt.issuedAt).toLocaleString("en-NG")} · Payments
        verified by Monnify
      </p>
    </div>
  );
}
