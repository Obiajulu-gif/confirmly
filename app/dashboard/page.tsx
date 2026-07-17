import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { integrationStatus } from "@/lib/env";
import { formatNaira } from "@/lib/money";
import { Badge, Card, EmptyState, StatCard, stateTone } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const merchantId = session.merchantId;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [ordersToday, paidAgg, pendingCount, attentionOrders, recentEvents] =
    await Promise.all([
      prisma.order.count({
        where: { merchantId, createdAt: { gte: startOfDay } },
      }),
      prisma.order.aggregate({
        where: { merchantId, state: { in: ["PAID", "FULFILLING", "COMPLETED"] } },
        _sum: { totalKobo: true },
        _count: true,
      }),
      prisma.order.count({
        where: { merchantId, state: "PAYMENT_PENDING" },
      }),
      prisma.order.findMany({
        where: {
          merchantId,
          OR: [
            { state: "NEEDS_ATTENTION" },
            { conversation: { state: { in: ["HUMAN_REQUIRED", "HUMAN_ACTIVE"] } } },
          ],
        },
        include: { customer: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.auditEvent.findMany({
        where: { merchantId },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { order: { select: { reference: true, id: true } } },
      }),
    ]);

  let databaseOk = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    databaseOk = false;
  }
  const integrations = integrationStatus();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">
          Overview
        </h1>
        <Link
          href="/dashboard/orders"
          className="text-sm font-semibold text-brand-700 hover:underline"
        >
          View all orders →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Orders today" value={String(ordersToday)} />
        <StatCard
          label="Paid revenue"
          value={formatNaira(paidAgg._sum.totalKobo ?? 0)}
          sub={`${paidAgg._count} paid order${paidAgg._count === 1 ? "" : "s"}`}
        />
        <StatCard label="Pending payments" value={String(pendingCount)} />
        <StatCard
          label="Needs attention"
          value={String(attentionOrders.length)}
          sub="payment exceptions & human handovers"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Orders requiring attention">
          {attentionOrders.length === 0 ? (
            <EmptyState
              title="Nothing needs your attention"
              hint="Payment exceptions and human-handover requests appear here."
            />
          ) : (
            <ul className="divide-y divide-ink-900/5">
              {attentionOrders.map((order) => (
                <li key={order.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <Link
                      href={`/dashboard/orders/${order.id}`}
                      className="font-mono text-sm font-semibold text-brand-700 hover:underline"
                    >
                      {order.reference}
                    </Link>
                    <p className="text-xs text-ink-500">
                      {order.customer.name ?? order.customer.phoneNumber}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium tabular-nums">
                      {formatNaira(order.totalKobo)}
                    </span>
                    <Badge tone={stateTone(order.state)}>{order.state}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Integration health">
          <ul className="space-y-3">
            {[
              ["Database", databaseOk, databaseOk ? "connected" : "unreachable"],
              [
                "WhatsApp Cloud API",
                integrations.whatsapp.configured,
                integrations.whatsapp.configured
                  ? "configured"
                  : `missing: ${integrations.whatsapp.missing.join(", ")}`,
              ],
              [
                "NVIDIA NIM",
                integrations.nvidia.configured,
                integrations.nvidia.configured
                  ? "configured"
                  : `missing: ${integrations.nvidia.missing.join(", ")}`,
              ],
              [
                "Monnify",
                integrations.monnify.configured,
                integrations.monnify.configured
                  ? "configured"
                  : `missing: ${integrations.monnify.missing.join(", ")}`,
              ],
            ].map(([name, ok, detail]) => (
              <li key={name as string} className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-ink-700">
                  {name as string}
                </span>
                <span className="flex items-center gap-2 text-xs text-ink-500">
                  {detail as string}
                  <span
                    aria-hidden
                    className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-brand-500" : "bg-red-500"}`}
                  />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-500">
            Live connectivity checks are on the{" "}
            <Link href="/dashboard/settings" className="font-semibold text-brand-700 hover:underline">
              Settings
            </Link>{" "}
            page.
          </p>
        </Card>
      </div>

      <Card title="Recent activity">
        {recentEvents.length === 0 ? (
          <EmptyState
            title="No activity yet"
            hint="Events appear here as customers chat and pay."
          />
        ) : (
          <ol className="space-y-3">
            {recentEvents.map((event) => (
              <li key={event.id} className="flex items-center gap-3 text-sm">
                <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                <span className="flex-1 text-ink-700">
                  {event.event}
                  {event.order ? (
                    <>
                      {" · "}
                      <Link
                        href={`/dashboard/orders/${event.order.id}`}
                        className="font-mono text-brand-700 hover:underline"
                      >
                        {event.order.reference}
                      </Link>
                    </>
                  ) : null}
                </span>
                <span className="text-xs tabular-nums text-ink-500">
                  {event.createdAt.toLocaleString("en-NG", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
