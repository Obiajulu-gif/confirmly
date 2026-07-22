import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { Badge, Card, EmptyState, stateTone } from "@/components/ui";
import type { OrderState, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Orders" };

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "PAYMENT_PENDING", label: "Awaiting payment" },
  { value: "PAID", label: "Paid" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string }>;
}) {
  const { q, state } = await searchParams;

  const where: Prisma.OrderWhereInput = {};
  if (state && FILTERS.some((f) => f.value === state)) {
    where.state = state as OrderState;
  }
  if (q) {
    where.OR = [
      { reference: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customer: { phoneNumber: { contains: q } } },
      { merchant: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      customer: { select: { name: true, phoneNumber: true } },
      merchant: { select: { name: true } },
      payment: { select: { state: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        Orders <span className="text-ink-400">(all stores)</span>
      </h1>

      <Card>
        <form method="GET" className="mb-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search reference, customer, store…"
            aria-label="Search orders"
            className="flex-1 rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-sm"
          />
          <select
            name="state"
            defaultValue={state ?? ""}
            aria-label="Filter by state"
            className="rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-sm"
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Filter
          </button>
        </form>

        {orders.length === 0 ? (
          <EmptyState title="No orders match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-900/10 text-xs uppercase tracking-wide text-ink-500">
                  <th className="py-2 pr-4 font-semibold">Reference</th>
                  <th className="py-2 pr-4 font-semibold">Store</th>
                  <th className="py-2 pr-4 font-semibold">Customer</th>
                  <th className="py-2 pr-4 font-semibold">Amount</th>
                  <th className="py-2 pr-4 font-semibold">Created</th>
                  <th className="py-2 pr-4 font-semibold">Payment</th>
                  <th className="py-2 font-semibold">Order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-900/5">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-brand-50/40">
                    <td className="py-3 pr-4 font-mono font-semibold text-ink-800">
                      {order.reference}
                    </td>
                    <td className="py-3 pr-4 text-ink-700">
                      {order.merchant.name}
                    </td>
                    <td className="py-3 pr-4 text-ink-700">
                      {order.customer.name ?? order.customer.phoneNumber}
                    </td>
                    <td className="py-3 pr-4 font-medium tabular-nums">
                      {formatNaira(order.totalKobo)}
                    </td>
                    <td className="py-3 pr-4 text-xs tabular-nums text-ink-500">
                      {order.createdAt.toLocaleString("en-NG", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={stateTone(order.payment?.state ?? "CREATED")}>
                        {order.payment?.state ?? "—"}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <Badge tone={stateTone(order.state)}>{order.state}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Link href="/admin" className="inline-block text-sm text-brand-700 hover:underline">
        ← Back to overview
      </Link>
    </div>
  );
}
