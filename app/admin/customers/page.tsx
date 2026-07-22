import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge, Card, EmptyState } from "@/components/ui";
import { setCustomerOptIn } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Customers" };

/** Masks a WhatsApp number for display (keeps country + last 3 digits). */
function maskNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6) return value;
  return `${digits.slice(0, 4)}••••${digits.slice(-3)}`;
}

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const customers = await prisma.customer.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phoneNumber: { contains: q } },
            { waId: { contains: q } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      merchant: { select: { name: true } },
      _count: { select: { orders: true } },
    },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        Customers
      </h1>

      <Card>
        <form method="GET" className="mb-4 flex gap-3">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name or number…"
            aria-label="Search customers"
            className="flex-1 rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Search
          </button>
        </form>

        {customers.length === 0 ? (
          <EmptyState title="No customers match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-900/10 text-xs uppercase tracking-wide text-ink-500">
                  <th className="py-2 pr-4 font-semibold">Customer</th>
                  <th className="py-2 pr-4 font-semibold">Number</th>
                  <th className="py-2 pr-4 font-semibold">Store</th>
                  <th className="py-2 pr-4 font-semibold">Orders</th>
                  <th className="py-2 pr-4 font-semibold">Opt-in</th>
                  <th className="py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-900/5">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-brand-50/40">
                    <td className="py-3 pr-4 font-medium text-ink-900">
                      {customer.name ?? "—"}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-ink-700">
                      {maskNumber(customer.phoneNumber)}
                    </td>
                    <td className="py-3 pr-4 text-ink-700">
                      {customer.merchant.name}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      {customer._count.orders}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={customer.optedIn ? "success" : "neutral"}>
                        {customer.optedIn ? "Opted in" : "Opted out"}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <form action={setCustomerOptIn}>
                        <input type="hidden" name="customerId" value={customer.id} />
                        <input
                          type="hidden"
                          name="optedIn"
                          value={customer.optedIn ? "" : "true"}
                        />
                        <button
                          type="submit"
                          className="rounded-lg border border-ink-900/15 px-3 py-1.5 text-xs font-semibold text-ink-700 transition hover:bg-ink-900/5"
                        >
                          {customer.optedIn ? "Opt out" : "Opt in"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-ink-500">
        Numbers are masked. Opt-out stops any outbound re-engagement message to
        that customer.
      </p>
      <Link href="/admin" className="inline-block text-sm text-brand-700 hover:underline">
        ← Back to overview
      </Link>
    </div>
  );
}
