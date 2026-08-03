import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireMerchantRole, BusinessAccessError } from "@/lib/authz/business-access";
import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { branchCloseBlockers } from "@/lib/business/service";
import { Badge, Card, StatCard } from "@/components/ui";
import {
  activateBranchAction,
  closeBranchAction,
  suspendBranchAction,
} from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Branch" };

export default async function BranchDetailPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;
  const session = await requireMerchantRole().catch((err) => {
    if (err instanceof BusinessAccessError) return null;
    throw err;
  });
  if (!session) redirect("/dashboard");

  const branch = await prisma.merchant.findFirst({
    where: { id: branchId, businessId: session.businessId },
    include: {
      _count: { select: { products: true, orders: true, conversations: true } },
      branchAssignments: {
        where: { active: true },
        include: {
          membership: { include: { user: { select: { name: true, email: true } } } },
        },
      },
    },
  });
  if (!branch) notFound();

  const [revenue, blockers] = await Promise.all([
    prisma.order.aggregate({
      _sum: { totalKobo: true },
      where: { merchantId: branch.id, state: { in: ["PAID", "COMPLETED"] } },
    }),
    branchCloseBlockers(branch.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/branches" className="text-sm text-brand-700 hover:underline">
          ← Branches
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">{branch.name}</h1>
          <Badge
            tone={
              branch.status === "ACTIVE"
                ? "success"
                : branch.status === "SUSPENDED"
                  ? "warning"
                  : "neutral"
            }
          >
            {branch.status}
          </Badge>
        </div>
        <p className="mt-1 font-mono text-xs text-ink-500">
          Code {branch.storeCode} · customers send START {branch.storeCode}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Verified revenue" value={formatNaira(revenue._sum.totalKobo ?? 0)} />
        <StatCard label="Products" value={String(branch._count.products)} />
        <StatCard label="Orders" value={String(branch._count.orders)} />
        <StatCard label="Conversations" value={String(branch._count.conversations)} />
      </div>

      <Card title="Assigned Branch Agents">
        {branch.branchAssignments.length === 0 ? (
          <p className="text-sm text-ink-500">
            No agents assigned.{" "}
            <Link href="/dashboard/agents/invite" className="text-brand-700 hover:underline">
              Invite one
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-ink-900/5 text-sm">
            {branch.branchAssignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2">
                <span>
                  <span className="font-medium text-ink-900">
                    {a.membership.user.name}
                  </span>{" "}
                  <span className="text-ink-500">{a.membership.user.email}</span>
                </span>
                <Badge tone={a.membership.status === "ACTIVE" ? "success" : "neutral"}>
                  {a.membership.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Branch controls">
        <div className="flex flex-wrap items-center gap-3">
          {branch.status === "ACTIVE" ? (
            <form action={suspendBranchAction}>
              <input type="hidden" name="branchId" value={branch.id} />
              <button className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100">
                Suspend branch
              </button>
            </form>
          ) : branch.status === "SUSPENDED" ? (
            <form action={activateBranchAction}>
              <input type="hidden" name="branchId" value={branch.id} />
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                Reactivate branch
              </button>
            </form>
          ) : null}

          {branch.status !== "CLOSED" ? (
            <form action={closeBranchAction}>
              <input type="hidden" name="branchId" value={branch.id} />
              <button
                disabled={blockers.length > 0}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Close branch
              </button>
            </form>
          ) : null}
        </div>
        {blockers.length > 0 && branch.status !== "CLOSED" ? (
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            Can&apos;t close yet — resolve first: {blockers.join("; ")}.
          </div>
        ) : null}
        <p className="mt-3 text-xs text-ink-500">
          Suspending hides the branch from WhatsApp branch selection and stops new orders, but
          preserves history and lets you manage existing orders. Closing is only allowed with no
          open obligations.
        </p>
      </Card>
    </div>
  );
}
