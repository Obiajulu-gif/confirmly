import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMerchantSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { maskReference } from "@/lib/receipts";
import { Badge, Card, stateTone } from "@/components/ui";
import { OrderActions } from "./order-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order details" };

export default async function OrderDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getMerchantSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const order = await prisma.order.findFirst({
    where: { id, merchantId: session.merchantId },
    include: {
      customer: true,
      items: true,
      payment: true,
      receipt: true,
      conversation: true,
      auditEvents: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/dashboard/orders"
            className="text-sm font-medium text-ink-500 hover:text-brand-700"
          >
            ← Orders
          </Link>
          <h1 className="font-mono text-2xl font-bold tracking-tight text-ink-900">
            {order.reference}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={stateTone(order.payment?.state ?? "CREATED")}>
            Payment: {order.payment?.state ?? "none"}
          </Badge>
          <Badge tone={stateTone(order.state)}>{order.state}</Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Items">
            <ul className="divide-y divide-ink-900/5">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 py-3 text-sm">
                  <span className="text-ink-700">
                    {item.quantity} × {item.productNameSnapshot}
                    {item.variantSnapshot ? (
                      <span className="text-ink-500"> ({item.variantSnapshot})</span>
                    ) : null}
                    <span className="block text-xs text-ink-500">
                      @ {formatNaira(item.unitPriceKoboSnapshot)} (locked at
                      confirmation)
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatNaira(item.lineTotalKobo)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-ink-900/10 pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">Subtotal</dt>
                <dd className="tabular-nums">{formatNaira(order.subtotalKobo)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">
                  {order.deliveryMethod === "PICKUP"
                    ? "Pickup"
                    : `Delivery${order.deliveryZone ? ` — ${order.deliveryZone}` : ""}`}
                </dt>
                <dd className="tabular-nums">{formatNaira(order.deliveryFeeKobo)}</dd>
              </div>
              <div className="flex justify-between text-base font-bold text-ink-900">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatNaira(order.totalKobo)}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Timeline">
            {order.auditEvents.length === 0 ? (
              <p className="text-sm text-ink-500">No events recorded.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-ink-900/10 pl-5">
                {order.auditEvents.map((event) => (
                  <li key={event.id} className="relative">
                    <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-surface-raised bg-brand-500" />
                    <p className="text-sm font-medium text-ink-900">
                      {event.event}
                    </p>
                    <p className="text-xs text-ink-500">
                      {event.actor} ·{" "}
                      {event.createdAt.toLocaleString("en-NG", {
                        dateStyle: "medium",
                        timeStyle: "medium",
                      })}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Actions">
            <OrderActions
              orderId={order.id}
              paymentId={order.payment?.id ?? null}
              orderState={order.state}
              paymentState={order.payment?.state ?? null}
              provider={order.payment?.provider ?? null}
            />
          </Card>

          <Card title="Customer">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-500">Name</dt>
                <dd className="font-medium text-ink-900">
                  {order.customer.name ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-500">Phone</dt>
                <dd className="font-medium text-ink-900">
                  {order.customer.phoneNumber}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-500">
                  Delivery address
                </dt>
                <dd className="font-medium text-ink-900">
                  {order.deliveryAddress ?? "—"}
                </dd>
              </div>
            </dl>
            {order.conversation ? (
              <Link
                href={`/dashboard/conversations/${order.conversation.id}`}
                className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline"
              >
                Open conversation →
              </Link>
            ) : null}
          </Card>

          <Card title="Payment">
            {order.payment ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-500">Provider</dt>
                  <dd className="font-medium">{order.payment.provider}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Invoice ref</dt>
                  <dd className="font-mono text-xs">{order.payment.invoiceReference}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Provider ref</dt>
                  <dd className="font-mono text-xs">
                    {maskReference(order.payment.transactionReference)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Expected</dt>
                  <dd className="tabular-nums">
                    {formatNaira(order.payment.expectedAmountKobo)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Paid</dt>
                  <dd className="tabular-nums">
                    {formatNaira(order.payment.paidAmountKobo)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Attempt</dt>
                  <dd>{order.payment.attempt}</dd>
                </div>
                {order.payment.verifiedAt ? (
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Last verified</dt>
                    <dd className="text-xs tabular-nums">
                      {order.payment.verifiedAt.toLocaleString("en-NG")}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="text-sm text-ink-500">No payment created yet.</p>
            )}
            {order.receipt ? (
              <Link
                href={`/receipt/${order.receipt.token}`}
                className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline"
              >
                View public receipt →
              </Link>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
