import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { Badge, Card, EmptyState } from "@/components/ui";
import { ProductForm } from "./product-forms";
import { toggleProductActiveAction, updateZoneFeeAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products" };

export default async function ProductsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [products, zones] = await Promise.all([
    prisma.product.findMany({
      where: { merchantId: session.merchantId },
      include: { variants: true },
      orderBy: { name: "asc" },
    }),
    prisma.deliveryZone.findMany({
      where: { merchantId: session.merchantId },
      orderBy: { feeKobo: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">
          Products
        </h1>
        <ProductForm />
      </div>

      <Card title="Catalogue">
        {products.length === 0 ? (
          <EmptyState
            title="No products yet"
            hint="Add products so the assistant can match customer orders."
          />
        ) : (
          <ul className="divide-y divide-ink-900/5">
            {products.map((product) => (
              <li key={product.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-ink-900">{product.name}</p>
                      <Badge tone={product.active ? "success" : "neutral"}>
                        {product.active ? "Active" : "Hidden"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-ink-500">
                      {formatNaira(product.priceKobo)} · stock{" "}
                      {product.stockQuantity}
                      {product.category ? ` · ${product.category}` : ""}
                    </p>
                    {product.aliases.length ? (
                      <p className="mt-1 text-xs text-ink-500">
                        Aliases: {product.aliases.join(", ")}
                      </p>
                    ) : null}
                    {product.variants.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {product.variants.map((v) => (
                          <span
                            key={v.id}
                            className="rounded-full bg-ink-900/5 px-2 py-0.5 text-xs text-ink-700"
                          >
                            {[v.colour, v.size].filter(Boolean).join(" / ")}
                            {v.priceAdjustmentKobo
                              ? ` (+${formatNaira(v.priceAdjustmentKobo)})`
                              : ""}
                            {` · ${v.stockQuantity}`}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <form action={toggleProductActiveAction}>
                      <input type="hidden" name="id" value={product.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-ink-900/10 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-900/5"
                      >
                        {product.active ? "Hide" : "Activate"}
                      </button>
                    </form>
                  </div>
                </div>
                <ProductForm product={product} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Delivery zones">
        <ul className="divide-y divide-ink-900/5">
          {zones.map((zone) => (
            <li
              key={zone.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="font-medium text-ink-900">{zone.name}</p>
                <p className="text-xs text-ink-500">
                  Aliases: {zone.aliases.join(", ") || "—"}
                </p>
              </div>
              <form action={updateZoneFeeAction} className="flex items-center gap-2">
                <input type="hidden" name="id" value={zone.id} />
                <label className="text-xs text-ink-500" htmlFor={`fee-${zone.id}`}>
                  Fee (NGN)
                </label>
                <input
                  id={`fee-${zone.id}`}
                  name="feeNaira"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={zone.feeKobo / 100}
                  className="w-28 rounded-lg border border-ink-900/10 bg-surface px-2 py-1.5 text-sm tabular-nums"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  Save
                </button>
              </form>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
