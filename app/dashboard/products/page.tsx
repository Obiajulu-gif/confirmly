import { redirect } from "next/navigation";
import { getMerchantSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { Badge, Card, EmptyState } from "@/components/ui";
import { ProductForm, ZoneForm } from "./product-forms";
import {
  duplicateProductAction,
  toggleProductActiveAction,
  toggleZoneActiveAction,
  updateZoneFeeAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products" };

export default async function ProductsPage() {
  const session = await getMerchantSession();
  if (!session) redirect("/login");

  const [merchant, products, zones] = await Promise.all([
    prisma.merchant.findUnique({
      where: { id: session.merchantId },
      select: { name: true, storeCode: true },
    }),
    prisma.product.findMany({
      where: { merchantId: session.merchantId },
      include: { variants: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.deliveryZone.findMany({
      where: { merchantId: session.merchantId },
      orderBy: [{ active: "desc" }, { feeKobo: "asc" }],
    }),
  ]);

  const categories = [
    ...new Set(products.map((product) => product.category).filter(Boolean)),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">
            {merchant?.name ?? "Store"} · {merchant?.storeCode}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">
            Catalogue and delivery
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            These are the products, categories and delivery options customers
            can select inside WhatsApp.
          </p>
        </div>
        <ProductForm />
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <Badge key={category} tone="neutral">
            {category}
          </Badge>
        ))}
      </div>

      <Card title="Catalogue">
        {products.length === 0 ? (
          <EmptyState
            title="No products yet"
            hint="Add products so customers can browse and the assistant can match free-text orders."
          />
        ) : (
          <ul className="divide-y divide-ink-900/5">
            {products.map((product) => (
              <li key={product.id} className="py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink-900">
                        {product.name}
                      </p>
                      <Badge tone={product.active ? "success" : "neutral"}>
                        {product.active ? "Active" : "Hidden"}
                      </Badge>
                      {product.imageUrl ? (
                        <Badge tone="success">Image configured</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-ink-500">
                      {formatNaira(product.priceKobo)} · stock{" "}
                      {product.stockQuantity}
                      {product.category ? ` · ${product.category}` : ""}
                    </p>
                    {product.description ? (
                      <p className="mt-2 max-w-2xl text-sm text-ink-500">
                        {product.description}
                      </p>
                    ) : null}
                    {product.aliases.length ? (
                      <p className="mt-2 text-xs text-ink-500">
                        Customer aliases: {product.aliases.join(", ")}
                      </p>
                    ) : null}
                    {product.variants.length ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {product.variants.map((variant) => (
                          <span
                            key={variant.id}
                            className="rounded-full bg-ink-900/5 px-2 py-1 text-xs text-ink-700"
                          >
                            {[variant.colour, variant.size]
                              .filter(Boolean)
                              .join(" / ")}
                            {variant.priceAdjustmentKobo
                              ? ` (+${formatNaira(variant.priceAdjustmentKobo)})`
                              : ""}
                            {` · ${variant.stockQuantity}`}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={toggleProductActiveAction}>
                      <input type="hidden" name="id" value={product.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-ink-900/10 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-900/5"
                      >
                        {product.active ? "Hide" : "Activate"}
                      </button>
                    </form>
                    <form action={duplicateProductAction}>
                      <input type="hidden" name="id" value={product.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-ink-900/10 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-900/5"
                      >
                        Duplicate
                      </button>
                    </form>
                    <ProductForm product={product} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Delivery zones">
        <p className="mb-4 text-sm text-ink-500">
          Add area aliases such as landmarks and neighbourhood names. When an
          exact customer location is unavailable, Confirmly suggests the closest
          matching configured options rather than inventing a fee.
        </p>
        <ZoneForm />
        {zones.length ? (
          <ul className="mt-4 divide-y divide-ink-900/5">
            {zones.map((zone) => (
              <li
                key={zone.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-ink-900">{zone.name}</p>
                    <Badge tone={zone.active ? "success" : "neutral"}>
                      {zone.active ? "Active" : "Hidden"}
                    </Badge>
                  </div>
                  <p className="text-xs text-ink-500">
                    Aliases: {zone.aliases.join(", ") || "none"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form
                    action={updateZoneFeeAction}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="id" value={zone.id} />
                    <label
                      className="text-xs text-ink-500"
                      htmlFor={`fee-${zone.id}`}
                    >
                      Fee
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
                  <form action={toggleZoneActiveAction}>
                    <input type="hidden" name="id" value={zone.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-ink-900/10 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-900/5"
                    >
                      {zone.active ? "Hide" : "Activate"}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4">
            <EmptyState
              title="No delivery zones"
              hint="Add delivery areas or a Pickup option."
            />
          </div>
        )}
      </Card>
    </div>
  );
}
