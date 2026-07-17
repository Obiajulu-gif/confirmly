import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { ConfirmlyLogo } from "@/components/logo";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Public payment page. This page NEVER changes payment state — it only
 * displays what the database (fed exclusively by verified Monnify responses)
 * already knows. Visiting it after checkout does not mark anything paid.
 */
export default async function PayPage({
  params,
}: {
  params: Promise<{ orderReference: string }>;
}) {
  const { orderReference } = await params;
  const order = await prisma.order.findUnique({
    where: { reference: orderReference },
    include: { items: true, payment: true, merchant: true, receipt: true },
  });
  if (!order) notFound();

  const paid = order.state === "PAID" || order.state === "COMPLETED";
  const payment = order.payment;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-8">
      <div className="mb-8 flex justify-center">
        <ConfirmlyLogo />
      </div>
      <div className="rounded-card border border-ink-900/5 bg-surface-raised p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-500">
              Order
            </p>
            <p className="font-mono text-lg font-bold text-ink-900">
              {order.reference}
            </p>
          </div>
          <Badge
            tone={paid ? "success" : payment?.state === "FAILED" ? "danger" : "warning"}
          >
            {paid ? "PAID" : (payment?.state ?? order.state)}
          </Badge>
        </div>

        <ul className="mt-6 space-y-3 border-t border-ink-900/5 pt-4">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 text-sm">
              <span className="text-ink-700">
                {item.quantity} × {item.productNameSnapshot}
                {item.variantSnapshot ? (
                  <span className="text-ink-500"> ({item.variantSnapshot})</span>
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
                : `Delivery${order.deliveryZone ? ` to ${order.deliveryZone}` : ""}`}
            </span>
            <span className="font-medium tabular-nums">
              {formatNaira(order.deliveryFeeKobo)}
            </span>
          </li>
        </ul>

        <div className="mt-4 flex justify-between border-t border-ink-900/5 pt-4">
          <span className="font-semibold text-ink-900">Total</span>
          <span className="text-lg font-bold tabular-nums text-ink-900">
            {formatNaira(order.totalKobo)}
          </span>
        </div>

        {paid ? (
          <div className="mt-6 rounded-xl bg-brand-50 p-4 text-sm text-brand-800 ring-1 ring-brand-200">
            <p className="font-semibold">Payment confirmed ✓</p>
            <p className="mt-1">
              This payment was verified directly with Monnify.
            </p>
            {order.receipt ? (
              <Link
                href={`/receipt/${order.receipt.token}`}
                className="mt-3 inline-block rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700"
              >
                View receipt
              </Link>
            ) : null}
          </div>
        ) : payment?.checkoutUrl && payment.provider === "MONNIFY" ? (
          <div className="mt-6">
            <a
              href={payment.checkoutUrl}
              className="block rounded-xl bg-brand-600 px-4 py-3 text-center font-semibold text-white hover:bg-brand-700"
            >
              Pay {formatNaira(order.totalKobo)} securely with Monnify
            </a>
            <p className="mt-3 text-center text-xs leading-relaxed text-ink-500">
              After you pay, Monnify notifies us directly and we verify the
              transaction on our servers. This page can&apos;t mark an order as
              paid — only a verified Monnify response can. Your receipt arrives
              on WhatsApp automatically.
            </p>
          </div>
        ) : (
          <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
            {payment?.provider === "DEMO"
              ? "Demo order — no real payment link exists."
              : "No active payment link. Ask the merchant for a fresh invoice on WhatsApp."}
          </p>
        )}
      </div>
      <p className="mt-6 text-center text-xs text-ink-500">
        Sold by {order.merchant.name} · Payments verified by Monnify
      </p>
    </div>
  );
}
