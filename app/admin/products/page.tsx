import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { Badge, Card, EmptyState } from "@/components/ui";
import { setProductActive } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Products" };

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const products = await prisma.product.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { merchant: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : undefined,
    orderBy: [{ merchant: { name: "asc" } }, { name: "asc" }],
    include: { merchant: { select: { name: true } } },
    take: 300,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        Products <span className="text-ink-400">(all stores)</span>
      </h1>

      <Card>
        <form method="GET" className="mb-4 flex gap-3">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search product or store…"
            aria-label="Search products"
            className="flex-1 rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Search
          </button>
        </form>

        {products.length === 0 ? (
          <EmptyState title="No products match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-900/10 text-xs uppercase tracking-wide text-ink-500">
                  <th className="py-2 pr-4 font-semibold">Product</th>
                  <th className="py-2 pr-4 font-semibold">Store</th>
                  <th className="py-2 pr-4 font-semibold">Price</th>
                  <th className="py-2 pr-4 font-semibold">Stock</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-900/5">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-brand-50/40">
                    <td className="py-3 pr-4 font-medium text-ink-900">
                      {product.name}
                    </td>
                    <td className="py-3 pr-4 text-ink-700">
                      {product.merchant.name}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      {formatNaira(product.priceKobo)}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      {product.stockQuantity}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={product.active ? "success" : "neutral"}>
                        {product.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <form action={setProductActive}>
                        <input type="hidden" name="productId" value={product.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={product.active ? "" : "true"}
                        />
                        <button
                          type="submit"
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            product.active
                              ? "border border-ink-900/15 text-ink-700 hover:bg-ink-900/5"
                              : "bg-brand-600 text-white hover:bg-brand-700"
                          }`}
                        >
                          {product.active ? "Deactivate" : "Activate"}
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
      <Link href="/admin" className="inline-block text-sm text-brand-700 hover:underline">
        ← Back to overview
      </Link>
    </div>
  );
}
