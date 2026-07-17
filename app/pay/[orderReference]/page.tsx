import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Clock3,
  CreditCard,
  Landmark,
  Lock,
  RefreshCw,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { formatNaira } from "@/lib/money";
import { ConfirmlyLogo } from "@/components/logo";
import { Badge } from "@/components/ui";
import { refreshPaymentStatusAction } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Public checkout page. Display-only: it never changes payment state — the
 * refresh button asks the SERVER to re-verify with Monnify. The merchant's
 * settlement bank account is never shown; transfer details are the temporary
 * Monnify account generated for this transaction.
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
  const va = payment?.virtualAccount as {
    accountNumber?: string;
    accountName?: string;
    bankName?: string;
    expiresOn?: string;
  } | null;
  const expires =
    va?.expiresOn ??
    (payment
      ? new Date(payment.createdAt.getTime() + 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 16)
          .replace("T", " ")
      : null);
  const waNumber = env().WHATSAPP_PUBLIC_NUMBER?.replace(/\D/g, "");
  const waLink = waNumber ? `https://wa.me/${waNumber}` : null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-8">
      <div className="mb-8 flex justify-center">
        <ConfirmlyLogo />
      </div>
      <div className="rounded-card border border-ink-900/5 bg-surface-raised p-6 shadow-sm">
        {/* Merchant + order header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-500">
              {order.merchant.name}
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
            <p className="flex items-center gap-2 font-semibold">
              <BadgeCheck className="h-4 w-4" aria-hidden />
              Payment confirmed
            </p>
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
        ) : payment && payment.provider === "MONNIFY" ? (
          <div className="mt-6 space-y-4">
            {payment.checkoutUrl ? (
              <a
                href={payment.checkoutUrl}
                className="block rounded-xl bg-brand-600 px-4 py-3 text-center font-semibold text-white hover:bg-brand-700"
              >
                Pay {formatNaira(order.totalKobo)} securely with Monnify
              </a>
            ) : null}

            {va?.accountNumber ? (
              <div className="rounded-xl border border-ink-900/10 bg-surface p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold text-ink-900">
                  <Landmark className="h-4 w-4 text-brand-700" aria-hidden />
                  Or transfer to this temporary account
                </p>
                <dl className="mt-2 space-y-1 text-ink-700">
                  <div className="flex justify-between">
                    <dt>Bank</dt>
                    <dd className="font-medium">{va.bankName}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Account number</dt>
                    <dd className="font-mono text-base font-bold text-ink-900">
                      {va.accountNumber}
                    </dd>
                  </div>
                  {va.accountName ? (
                    <div className="flex justify-between">
                      <dt>Account name</dt>
                      <dd className="font-medium">{va.accountName}</dd>
                    </div>
                  ) : null}
                </dl>
                <p className="mt-2 text-xs text-ink-500">
                  Generated by Monnify for this order only — it is not the
                  merchant&apos;s bank account.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
              <span className="flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" aria-hidden />
                Card · Bank transfer · USSD
              </span>
              {expires ? (
                <span className="flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden />
                  Link expires: {expires}
                </span>
              ) : null}
            </div>

            <form action={refreshPaymentStatusAction}>
              <input type="hidden" name="reference" value={order.reference} />
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-ink-900/10 px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:border-brand-400 hover:text-brand-700"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                I have paid — check status
              </button>
            </form>

            <p className="flex items-start gap-2 text-center text-xs leading-relaxed text-ink-500">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              After you pay, Monnify notifies us and we verify the transaction
              on our servers. This page can&apos;t mark an order as paid — only
              a verified Monnify response can. Your receipt arrives on WhatsApp
              automatically.
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

      <div className="mt-6 flex items-center justify-center gap-4 text-xs text-ink-500">
        {waLink ? (
          <a
            href={waLink}
            className="flex items-center gap-1.5 font-semibold text-brand-700 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to WhatsApp chat
          </a>
        ) : null}
        <span>Payments verified by Monnify</span>
      </div>
    </div>
  );
}
