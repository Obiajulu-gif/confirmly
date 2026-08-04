import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { Badge, Card, EmptyState } from "@/components/ui";
import { getDashboardScope, scopedBranchIds } from "@/lib/business/scope";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const scope = await getDashboardScope();
  if (!scope) redirect("/dashboard");
  const branchIds = scopedBranchIds(scope);
  const showBranch = branchIds.length > 1;

  const products = await prisma.product.findMany({
    where: { merchantId: { in: branchIds }, active: true },
    include: { merchant: { select: { name: true } } },
    orderBy: [{ stockQuantity: "asc" }, { name: "asc" }],
    take: 300,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Inventory</h1>
        <p className="mt-1 text-sm text-ink-500">
          Stock levels per branch. Edit quantities on the{" "}
          <Link href="/dashboard/products" className="text-brand-700 hover:underline">
            Products
          </Link>{" "}
          page.
        </p>
      </div>

      <Card>
        {products.length === 0 ? (
          <EmptyState title="No products yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-900/10 text-xs uppercase tracking-wide text-ink-500">
                  <th className="py-2 pr-4 font-semibold">Product</th>
                  {showBranch ? <th className="py-2 pr-4 font-semibold">Branch</th> : null}
                  <th className="py-2 pr-4 font-semibold">Price</th>
                  <th className="py-2 pr-4 font-semibold">Stock</th>
                  <th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-900/5">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-brand-50/40">
                    <td className="py-3 pr-4 font-medium text-ink-900">{p.name}</td>
                    {showBranch ? (
                      <td className="py-3 pr-4 text-ink-600">{p.merchant.name}</td>
                    ) : null}
                    <td className="py-3 pr-4 tabular-nums">{formatNaira(p.priceKobo)}</td>
                    <td className="py-3 pr-4 tabular-nums font-semibold">{p.stockQuantity}</td>
                    <td className="py-3">
                      {p.stockQuantity <= 0 ? (
                        <Badge tone="danger">Out of stock</Badge>
                      ) : p.stockQuantity <= 5 ? (
                        <Badge tone="warning">Low stock</Badge>
                      ) : (
                        <Badge tone="success">In stock</Badge>
                      )}
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
