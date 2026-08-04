import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { Badge, Card, StatCard } from "@/components/ui";
import {
  getConsolidatedMetrics,
  getBranchComparison,
} from "@/lib/business/service";
import { getDashboardScope, scopedBranchIds } from "@/lib/business/scope";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const scope = await getDashboardScope();
  if (!scope) redirect("/onboarding");

  const branchIds = scopedBranchIds(scope);
  const [metrics, comparison, recent] = await Promise.all([
    getConsolidatedMetrics(branchIds),
    scope.role === "MERCHANT" && !scope.activeBranchId
      ? getBranchComparison(branchIds)
      : Promise.resolve([]),
    prisma.auditEvent.findMany({
      where: { merchantId: { in: branchIds } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { merchant: { select: { name: true } } },
    }),
  ]);

  const scopeLabel = scope.activeBranchId
    ? (scope.branches.find((b) => b.id === scope.activeBranchId)?.name ?? "Branch")
    : "All Branches";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">
          {scope.role === "MERCHANT" ? "Merchant Dashboard" : "Branch Overview"}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {scopeLabel} · verified payment data only.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Verified revenue"
          value={formatNaira(metrics.verifiedRevenueKobo)}
          sub={`${metrics.paidOrders} paid of ${metrics.totalOrders} orders`}
        />
        <StatCard
          label="Pending orders"
          value={metrics.pendingOrders.toLocaleString()}
          sub={`${metrics.cancelledOrders} cancelled`}
        />
        <StatCard
          label="Open chats"
          value={metrics.openChats.toLocaleString()}
          sub={`${metrics.chatsNeedingAttention} need attention`}
        />
        <StatCard
          label="Stock alerts"
          value={(metrics.lowStock + metrics.outOfStock).toLocaleString()}
          sub={`${metrics.outOfStock} out of stock`}
        />
      </div>

      {comparison.length > 0 ? (
        <Card title="Branch comparison">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-900/10 text-xs uppercase tracking-wide text-ink-500">
                  <th className="py-2 pr-4 font-semibold">Branch</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 pr-4 font-semibold">Paid orders</th>
                  <th className="py-2 font-semibold">Verified revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-900/5">
                {comparison.map((b) => (
                  <tr key={b.id} className="hover:bg-brand-50/40">
                    <td className="py-3 pr-4 font-medium text-ink-900">
                      <Link href={`/dashboard/branches/${b.id}`} className="hover:underline">
                        {b.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={b.status === "ACTIVE" ? "success" : "neutral"}>
                        {b.status}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 tabular-nums">{b.paidOrders}</td>
                    <td className="py-3 font-medium tabular-nums">
                      {formatNaira(b.verifiedRevenueKobo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card title="Recent activity">
        {recent.length === 0 ? (
          <p className="text-sm text-ink-500">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-ink-900/5 text-sm">
            {recent.map((event) => (
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
