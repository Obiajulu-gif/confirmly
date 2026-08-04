import { redirect } from "next/navigation";
import { formatNaira } from "@/lib/money";
import { Card, StatCard } from "@/components/ui";
import { getConsolidatedMetrics } from "@/lib/business/service";
import { getDashboardScope, scopedBranchIds } from "@/lib/business/scope";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const scope = await getDashboardScope();
  if (!scope) redirect("/dashboard");
  const branchIds = scopedBranchIds(scope);
  const metrics = await getConsolidatedMetrics(branchIds);

  const scopeLabel = scope.activeBranchId
    ? (scope.branches.find((b) => b.id === scope.activeBranchId)?.name ?? "Branch")
    : scope.role === "MERCHANT"
      ? "All Branches"
      : "Your branch";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Reports</h1>
        <p className="mt-1 text-sm text-ink-500">
          {scopeLabel} · revenue is from verified payments only. Customer numbers are masked in
          exports.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Verified revenue" value={formatNaira(metrics.verifiedRevenueKobo)} />
        <StatCard label="Paid orders" value={String(metrics.paidOrders)} />
        <StatCard label="Total orders" value={String(metrics.totalOrders)} />
        <StatCard label="Cancelled" value={String(metrics.cancelledOrders)} />
      </div>

      <Card title="Export">
        <p className="text-sm text-ink-500">
          Download the current scope&apos;s orders as CSV (reference, branch, masked customer,
          amount, payment state, date).
        </p>
        <a
          href="/api/business/reports/export"
          className="mt-3 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Download orders CSV
        </a>
      </Card>
    </div>
  );
}
