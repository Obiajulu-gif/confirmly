import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge, Card, EmptyState } from "@/components/ui";
import { setMerchantActive } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Merchants" };

export default async function AdminMerchantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const merchants = await prisma.merchant.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { storeCode: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { products: true, orders: true, customers: true } },
    },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        Merchants
      </h1>

      <Card>
        <form method="GET" className="mb-4 flex gap-3">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name, store code, email…"
            aria-label="Search merchants"
            className="flex-1 rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Search
          </button>
        </form>

        {merchants.length === 0 ? (
          <EmptyState title="No merchants match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-900/10 text-xs uppercase tracking-wide text-ink-500">
                  <th className="py-2 pr-4 font-semibold">Store</th>
                  <th className="py-2 pr-4 font-semibold">Code</th>
                  <th className="py-2 pr-4 font-semibold">Products</th>
                  <th className="py-2 pr-4 font-semibold">Orders</th>
                  <th className="py-2 pr-4 font-semibold">Customers</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-900/5">
                {merchants.map((merchant) => (
                  <tr key={merchant.id} className="hover:bg-brand-50/40">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-ink-900">{merchant.name}</p>
                      <p className="text-xs text-ink-500">{merchant.email}</p>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-ink-700">
                      {merchant.storeCode}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      {merchant._count.products}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      {merchant._count.orders}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      {merchant._count.customers}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={merchant.active ? "success" : "neutral"}>
                        {merchant.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <form action={setMerchantActive}>
                        <input type="hidden" name="merchantId" value={merchant.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={merchant.active ? "" : "true"}
                        />
                        <button
                          type="submit"
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            merchant.active
                              ? "border border-ink-900/15 text-ink-700 hover:bg-ink-900/5"
                              : "bg-brand-600 text-white hover:bg-brand-700"
                          }`}
                        >
                          {merchant.active ? "Deactivate" : "Activate"}
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
        Deactivating a merchant hides its store from WhatsApp customers. It is a
        soft change — orders and history are preserved and it can be reactivated
        anytime. Every toggle is written to the audit log.
      </p>
      <Link href="/admin" className="inline-block text-sm text-brand-700 hover:underline">
        ← Back to overview
      </Link>
    </div>
  );
}
