import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getBranchContext } from "@/lib/business/scope";
import { formatNaira } from "@/lib/money";
import { Badge, Card, EmptyState } from "@/components/ui";
import { ProductForm, ZoneForm } from "./product-forms";
import { ProductFilters, type ProductFilterValues } from "./product-filters";
import { DistanceDeliveryForm } from "./distance-delivery-form";
import { isDistancePricingEnabled } from "@/lib/orders/distance-delivery";
import {
  duplicateProductAction,
  toggleProductActiveAction,
  toggleZoneActiveAction,
  updateZoneFeeAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products" };

function imageBadge(product: {
  imageSource: string | null;
  imageStatus: string;
  imageApprovedAt: Date | null;
}) {
  if (product.imageStatus === "FAILED")
    return <Badge tone="danger">Image generation failed</Badge>;
  if (product.imageSource === "MERCHANT_UPLOAD")
    return <Badge tone="success">Merchant photo</Badge>;
  if (product.imageSource === "AI_GENERATED")
    return (
      <Badge tone={product.imageApprovedAt ? "success" : "warning"}>
        {product.imageApprovedAt
          ? "AI illustration approved"
          : "AI illustration awaiting approval"}
      </Badge>
    );
  if (product.imageSource === "EXTERNAL_URL")
    return <Badge tone="info">External image</Badge>;
  return <Badge tone="neutral">No image</Badge>;
}

const PAGE_SIZE = 30;
const LOW_STOCK = 5;

type Search = Record<string, string | string[] | undefined>;
const param = (sp: Search, key: string) => {
  const v = sp[key];
  return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
};

/** Translates the filter form's query string into a Prisma query. */
function productQuery(branchId: string, f: ProductFilterValues) {
  const and: Prisma.ProductWhereInput[] = [{ merchantId: branchId }];
  if (f.q) {
    const contains = { contains: f.q, mode: "insensitive" as const };
    and.push({
      OR: [
        { name: contains },
        { description: contains },
        { category: contains },
        { variants: { some: { sku: contains } } },
      ],
    });
  }
  if (f.category) and.push({ category: f.category });
  if (f.status === "active") and.push({ active: true });
  if (f.status === "hidden") and.push({ active: false });
  if (f.stock === "in") and.push({ stockQuantity: { gt: 0 } });
  if (f.stock === "low") and.push({ stockQuantity: { gt: 0, lte: LOW_STOCK } });
  if (f.stock === "out") and.push({ stockQuantity: { lte: 0 } });
  if (f.image === "with") and.push({ imageUrl: { not: null } });
  if (f.image === "missing") and.push({ imageUrl: null });
  if (f.image === "pending") and.push({ imageSource: "AI_GENERATED", imageApprovedAt: null });

  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    f.sort === "newest"
      ? [{ createdAt: "desc" }]
      : f.sort === "price-asc"
        ? [{ priceKobo: "asc" }, { name: "asc" }]
        : f.sort === "price-desc"
          ? [{ priceKobo: "desc" }, { name: "asc" }]
          : f.sort === "stock-asc"
            ? [{ stockQuantity: "asc" }, { name: "asc" }]
            : [{ category: "asc" }, { name: "asc" }];

  return { where: { AND: and }, orderBy };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const ctx = await getBranchContext();
  if (!ctx) redirect("/dashboard");
  const branchId = ctx.branchId;

  const sp = await searchParams;
  const filters: ProductFilterValues = {
    q: param(sp, "q").slice(0, 100),
    category: param(sp, "category"),
    status: param(sp, "status"),
    stock: param(sp, "stock"),
    image: param(sp, "image"),
    sort: param(sp, "sort"),
  };
  const filtered = Boolean(
    filters.q || filters.category || filters.status || filters.stock || filters.image
  );
  const { where, orderBy } = productQuery(branchId, filters);
  const requestedPage = Math.max(1, Number.parseInt(param(sp, "page"), 10) || 1);

  const [merchant, totalProducts, matching, categoryRows, zones] = await Promise.all([
    prisma.merchant.findUnique({
      where: { id: branchId },
      select: {
        name: true,
        storeCode: true,
        storeLatitude: true,
        storeLongitude: true,
        deliveryBaseFeeKobo: true,
        deliveryPerKmKobo: true,
        deliveryMaxKm: true,
      },
    }),
    prisma.product.count({ where: { merchantId: branchId } }),
    prisma.product.count({ where }),
    prisma.product.findMany({
      where: { merchantId: branchId, category: { not: null } },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
    prisma.deliveryZone.findMany({
      where: { merchantId: branchId },
      orderBy: [{ active: "desc" }, { feeKobo: "asc" }],
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const products = await prisma.product.findMany({
    where,
    include: { variants: true },
    orderBy,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const categories = categoryRows.flatMap((row) => (row.category ? [row.category] : []));

  /** Same filters, different page, for the pager links. */
  const pageHref = (n: number) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) qs.set(key, value);
    if (n > 1) qs.set("page", String(n));
    const query = qs.toString();
    return query ? `/dashboard/products?${query}` : "/dashboard/products";
  };
  const first = matching === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = (page - 1) * PAGE_SIZE + products.length;

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
            Attach real product photographs or generate clearly labelled AI
            illustrations, then let customers preview products inside WhatsApp.
          </p>
        </div>
        <ProductForm />
      </div>

      <Card title="Catalogue">
        {totalProducts > 0 ? (
          <div className="mb-5 space-y-3 border-b border-ink-900/5 pb-5">
            <ProductFilters values={filters} categories={categories} filtered={filtered} />
            <p className="text-sm text-ink-500" aria-live="polite">
              {matching === 0
                ? "No products match."
                : `Showing ${first}–${last} of ${matching}${filtered ? ` matching (${totalProducts} in total)` : ""}`}
            </p>
          </div>
        ) : null}
        {totalProducts === 0 ? (
          <EmptyState
            title="No products yet"
            hint="Add products so customers can browse and the assistant can match free-text orders."
          />
        ) : products.length === 0 ? (
          <EmptyState
            title="No products match these filters"
            hint="Try a different search, or clear the filters to see the whole catalogue."
          />
        ) : (
          <ul className="divide-y divide-ink-900/5">
            {products.map((product) => (
              <li key={product.id} className="py-5">
                {/* Phones: image, then details, then actions, stacked.
                    sm+: image beside the details, actions on the right. */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.imageUrl}
                        alt=""
                        className="h-48 w-full rounded-xl border border-ink-900/10 bg-ink-900/[0.02] object-contain sm:h-20 sm:w-20 sm:shrink-0"
                      />
                    ) : (
                      <div className="flex h-32 w-full items-center justify-center rounded-xl border border-dashed border-ink-900/15 text-center text-xs text-ink-500 sm:h-20 sm:w-20 sm:shrink-0 sm:text-[10px]">
                        No image
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words font-semibold text-ink-900">
                          {product.name}
                        </p>
                        <Badge tone={product.active ? "success" : "neutral"}>
                          {product.active ? "Active" : "Hidden"}
                        </Badge>
                        {imageBadge(product)}
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
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-ink-900/5 pt-4 sm:shrink-0 sm:justify-end sm:border-0 sm:pt-0">
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
                    <ProductForm
                      product={{
                        id: product.id,
                        name: product.name,
                        description: product.description,
                        category: product.category,
                        priceKobo: product.priceKobo,
                        aliases: product.aliases,
                        stockQuantity: product.stockQuantity,
                        imageUrl: product.imageUrl,
                        imageSource: product.imageSource,
                        imageStatus: product.imageStatus,
                        imageApprovedAt:
                          product.imageApprovedAt?.toISOString() ?? null,
                        imageFailureReason: product.imageFailureReason,
                        variants: product.variants,
                      }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {pageCount > 1 ? (
          <nav
            aria-label="Product pages"
            className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-900/5 pt-4 text-sm"
          >
            {page > 1 ? (
              <Link
                href={pageHref(page - 1)}
                className="rounded-lg border border-ink-900/10 px-3 py-1.5 font-semibold text-ink-700 hover:bg-ink-900/5"
              >
                ← Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="text-ink-500">
              Page {page} of {pageCount}
            </span>
            {page < pageCount ? (
              <Link
                href={pageHref(page + 1)}
                className="rounded-lg border border-ink-900/10 px-3 py-1.5 font-semibold text-ink-700 hover:bg-ink-900/5"
              >
                Next →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </Card>

      <Card title="Delivery by distance">
        <p className="mb-4 text-sm text-ink-500">
          Let customers share their exact location on WhatsApp instead of picking a fixed area.
          Delivery is priced from your store to their pin automatically. Your delivery zones below
          stay available as well.
        </p>
        <DistanceDeliveryForm
          current={{
            latitude: merchant?.storeLatitude ?? null,
            longitude: merchant?.storeLongitude ?? null,
            baseFeeNaira: merchant?.deliveryBaseFeeKobo != null ? merchant.deliveryBaseFeeKobo / 100 : null,
            perKmNaira: merchant?.deliveryPerKmKobo != null ? merchant.deliveryPerKmKobo / 100 : null,
            maxKm: merchant?.deliveryMaxKm ?? null,
            enabled: merchant ? isDistancePricingEnabled(merchant) : false,
          }}
        />
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
