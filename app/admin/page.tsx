import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { Badge, Card, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin overview" };

export default async function AdminOverviewPage() {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    registrations,
    registrations30d,
    customers,
    distinctOrderers,
    totalOrders,
    orders30d,
    ordersByState,
    gmv,
    merchantsTotal,
    merchantsActive,
    settlementAgg,
    recentEvents,
  ] = await Promise.all([
    prisma.waSession.count(),
    prisma.waSession.count({ where: { createdAt: { gte: since30d } } }),
    prisma.customer.count(),
    prisma.order.findMany({ distinct: ["customerId"], select: { customerId: true } }),
    prisma.order.count(),
    prisma.order.count({ where: { createdAt: { gte: since30d } } }),
    prisma.order.groupBy({ by: ["state"], _count: { _all: true } }),
    prisma.order.aggregate({
      _sum: { totalKobo: true },
      where: { state: { in: ["PAID", "COMPLETED"] } },
    }),
    prisma.merchant.count(),
    prisma.merchant.count({ where: { active: true } }),
    prisma.settlement.groupBy({
      by: ["state"],
      _count: { _all: true },
      _sum: { netAmountKobo: true },
    }),
    prisma.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { merchant: { select: { name: true } } },
    }),
  ]);

  const settled = settlementAgg.find((s) => s.state === "SETTLED");
  const pendingSettle = settlementAgg.find((s) => s.state === "PENDING");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">
          Platform overview
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Every merchant, customer and order across Confirmly.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="WhatsApp numbers registered"
          value={registrations.toLocaleString()}
          sub={`+${registrations30d.toLocaleString()} in last 30 days`}
        />
        <StatCard
          label="Customers who ordered"
          value={distinctOrderers.length.toLocaleString()}
          sub={`${customers.toLocaleString()} customer profiles total`}
        />
        <StatCard
          label="Orders"
          value={totalOrders.toLocaleString()}
          sub={`+${orders30d.toLocaleString()} in last 30 days`}
        />
        <StatCard
          label="Gross merchandise value"
          value={formatNaira(gmv._sum.totalKobo ?? 0)}
          sub="Paid & completed orders"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Merchants">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold tabular-nums text-ink-900">
              {merchantsActive}
            </span>
            <span className="text-sm text-ink-500">
              active of {merchantsTotal} total
            </span>
          </div>
        </Card>

        <Card title="Settlements">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-ink-500">Settled</p>
              <p className="text-lg font-semibold tabular-nums text-ink-900">
                {formatNaira(settled?._sum.netAmountKobo ?? 0)}
              </p>
              <p className="text-xs text-ink-500">
                {settled?._count._all ?? 0} settlement(s)
              </p>
            </div>
            <div>
              <p className="text-ink-500">Pending</p>
              <p className="text-lg font-semibold tabular-nums text-amber-700">
                {formatNaira(pendingSettle?._sum.netAmountKobo ?? 0)}
              </p>
              <p className="text-xs text-ink-500">
                {pendingSettle?._count._all ?? 0} pending
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Orders by state">
        <div className="flex flex-wrap gap-2">
          {ordersByState.length === 0 ? (
            <span className="text-sm text-ink-500">No orders yet.</span>
          ) : (
            ordersByState
              .sort((a, b) => b._count._all - a._count._all)
              .map((row) => (
                <span
                  key={row.state}
                  className="inline-flex items-center gap-2 rounded-lg bg-ink-900/5 px-3 py-1.5 text-sm"
                >
                  <span className="font-medium text-ink-700">{row.state}</span>
                  <span className="tabular-nums font-semibold text-ink-900">
                    {row._count._all}
                  </span>
                </span>
              ))
          )}
        </div>
      </Card>

      <Card title="Recent activity">
        {recentEvents.length === 0 ? (
          <p className="text-sm text-ink-500">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-ink-900/5 text-sm">
            {recentEvents.map((event) => (
              <li key={event.id} className="flex items-center justify-between py-2">
                <span className="text-ink-700">{event.event}</span>
                <span className="flex items-center gap-3">
                  <Badge tone="neutral">{event.merchant.name}</Badge>
                  <span className="text-xs tabular-nums text-ink-500">
                    {event.createdAt.toLocaleString("en-NG", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
