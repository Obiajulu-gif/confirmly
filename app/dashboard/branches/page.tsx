import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMerchantRole, BusinessAccessError } from "@/lib/authz/business-access";
import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { Badge, Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Branches" };

export default async function BranchesPage() {
  const session = await requireMerchantRole().catch((err) => {
    if (err instanceof BusinessAccessError) return null;
    throw err;
  });
  if (!session) redirect("/dashboard");

  const branches = await prisma.merchant.findMany({
    where: { businessId: session.businessId },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { products: true, orders: true } },
    },
  });
  const revenue = await prisma.order.groupBy({
    by: ["merchantId"],
    _sum: { totalKobo: true },
    where: {
      merchantId: { in: branches.map((b) => b.id) },
      state: { in: ["PAID", "COMPLETED"] },
    },
  });
  const revByBranch = new Map(revenue.map((r) => [r.merchantId, r._sum.totalKobo ?? 0]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Branches</h1>
          <p className="mt-1 text-sm text-ink-500">
            Every branch under your business. One shared WhatsApp number serves them all.
          </p>
        </div>
        <Link
          href="/dashboard/branches/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Add branch
        </Link>
      </div>

      <Card>
        {branches.length === 0 ? (
          <EmptyState title="No branches yet" hint="Add your first branch to start taking orders." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-900/10 text-xs uppercase tracking-wide text-ink-500">
                  <th className="py-2 pr-4 font-semibold">Branch</th>
                  <th className="py-2 pr-4 font-semibold">Code</th>
                  <th className="py-2 pr-4 font-semibold">Products</th>
                  <th className="py-2 pr-4 font-semibold">Orders</th>
                  <th className="py-2 pr-4 font-semibold">Verified revenue</th>
                  <th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-900/5">
                {branches.map((b) => (
                  <tr key={b.id} className="hover:bg-brand-50/40">
                    <td className="py-3 pr-4">
                      <Link
                        href={`/dashboard/branches/${b.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {b.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-ink-700">{b.storeCode}</td>
                    <td className="py-3 pr-4 tabular-nums">{b._count.products}</td>
                    <td className="py-3 pr-4 tabular-nums">{b._count.orders}</td>
                    <td className="py-3 pr-4 font-medium tabular-nums">
                      {formatNaira(revByBranch.get(b.id) ?? 0)}
                    </td>
                    <td className="py-3">
                      <Badge
                        tone={
                          b.status === "ACTIVE"
                            ? "success"
                            : b.status === "SUSPENDED"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {b.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
