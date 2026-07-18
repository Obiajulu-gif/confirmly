import Link from "next/link";
import { redirect } from "next/navigation";
import { getMerchantSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { Badge, Card, EmptyState } from "@/components/ui";
import { StoreCreateForm } from "./store-create-form";
import { switchStoreAction, toggleStoreAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stores" };

export default async function StoresPage() {
  const session = await getMerchantSession();
  if (!session) redirect("/login");

  const memberships = await prisma.merchantMembership.findMany({
    where: { userId: session.userId },
    include: {
      merchant: {
        include: {
          _count: {
            select: {
              products: true,
              orders: true,
              conversations: true,
            },
          },
          paymentProfiles: {
            where: { active: true },
            take: 1,
            select: {
              validationStatus: true,
              subaccountStatus: true,
              accountNumberMasked: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const revenue = await Promise.all(
    memberships.map(({ merchant }) =>
      prisma.order.aggregate({
        where: {
          merchantId: merchant.id,
          state: { in: ["PAID", "FULFILLING", "COMPLETED"] },
        },
        _sum: { totalKobo: true },
      })
    )
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">
            Multi-store workspace
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">
            Stores
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Manage every storefront attached to this account. Customers see
            active stores as clickable choices inside WhatsApp.
          </p>
        </div>
        <Link
          href="/start"
          className="rounded-xl border border-ink-900/10 bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-900/5"
        >
          Preview public store directory
        </Link>
      </div>

      {memberships.length === 0 ? (
        <EmptyState
          title="No store connected"
          hint="Create your first store below."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {memberships.map(({ merchant, role }, index) => {
            const payment = merchant.paymentProfiles[0];
            const isCurrent = merchant.id === session.merchantId;
            return (
              <Card key={merchant.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-bold text-ink-900">
                        {merchant.name}
                      </h2>
                      {isCurrent ? <Badge tone="success">Current</Badge> : null}
                      <Badge tone={merchant.active ? "success" : "neutral"}>
                        {merchant.active ? "Live" : "Paused"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-ink-500">
                      {merchant.category || "General store"} · Code{" "}
                      <span className="font-mono font-semibold">
                        {merchant.storeCode}
                      </span>
                    </p>
                    {merchant.description ? (
                      <p className="mt-2 line-clamp-2 text-sm text-ink-500">
                        {merchant.description}
                      </p>
                    ) : null}
                  </div>
                  <span className="rounded-lg bg-ink-900/5 px-2 py-1 text-xs font-semibold text-ink-500">
                    {role}
                  </span>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-ink-500">Products</dt>
                    <dd className="font-bold text-ink-900">
                      {merchant._count.products}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">Orders</dt>
                    <dd className="font-bold text-ink-900">
                      {merchant._count.orders}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">Chats</dt>
                    <dd className="font-bold text-ink-900">
                      {merchant._count.conversations}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">Verified revenue</dt>
                    <dd className="font-bold text-ink-900">
                      {formatNaira(revenue[index]?._sum.totalKobo ?? 0)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 rounded-xl bg-ink-900/[0.03] px-3 py-2 text-xs text-ink-500">
                  Payment routing:{" "}
                  {payment
                    ? `${payment.accountNumberMasked} · ${payment.subaccountStatus}`
                    : "setup required before checkout"}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {!isCurrent && merchant.active ? (
                    <form action={switchStoreAction}>
                      <input
                        type="hidden"
                        name="merchantId"
                        value={merchant.id}
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                      >
                        Manage this store
                      </button>
                    </form>
                  ) : (
                    <Link
                      href="/dashboard/products"
                      className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                    >
                      Manage products
                    </Link>
                  )}
                  <form action={toggleStoreAction}>
                    <input
                      type="hidden"
                      name="merchantId"
                      value={merchant.id}
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-ink-900/10 px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-900/5"
                    >
                      {merchant.active ? "Pause store" : "Resume store"}
                    </button>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <StoreCreateForm />
    </div>
  );
}
