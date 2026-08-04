import { redirect } from "next/navigation";
import { requireMerchantRole, BusinessAccessError } from "@/lib/authz/business-access";
import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { walletSummary } from "@/lib/business/service";
import { Badge, Card, EmptyState, StatCard } from "@/components/ui";
import { WithdrawForm } from "./withdraw-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Withdrawals" };

export default async function WithdrawalsPage() {
  const session = await requireMerchantRole().catch((err) => {
    if (err instanceof BusinessAccessError) return null;
    throw err;
  });
  if (!session) redirect("/dashboard");

  const [wallet, withdrawals] = await Promise.all([
    walletSummary(session.businessId),
    prisma.withdrawal.findMany({
      where: { businessId: session.businessId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Withdrawals</h1>
        <p className="mt-1 text-sm text-ink-500">
          Business wallet from verified Monnify payments. Only a Merchant can withdraw.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Available balance" value={formatNaira(wallet.availableKobo)} sub="Verified & unreserved" />
        <StatCard label="Pending requests" value={formatNaira(wallet.pendingWithdrawalKobo)} />
        <StatCard label="Withdrawn to date" value={formatNaira(wallet.withdrawnKobo)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Request a withdrawal">
          <WithdrawForm availableNaira={formatNaira(wallet.availableKobo)} />
        </Card>

        <Card title="Per-branch contribution">
          {wallet.perBranch.length === 0 ? (
            <p className="text-sm text-ink-500">No verified revenue yet.</p>
          ) : (
            <ul className="divide-y divide-ink-900/5 text-sm">
              {wallet.perBranch.map((b) => (
                <li key={b.branchId} className="flex items-center justify-between py-2">
                  <span className="text-ink-700">{b.name}</span>
                  <span className="font-medium tabular-nums">{formatNaira(b.amountKobo)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Withdrawal history">
        {withdrawals.length === 0 ? (
          <EmptyState title="No withdrawals yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-900/10 text-xs uppercase tracking-wide text-ink-500">
                  <th className="py-2 pr-4 font-semibold">Reference</th>
                  <th className="py-2 pr-4 font-semibold">Amount</th>
                  <th className="py-2 pr-4 font-semibold">Destination</th>
                  <th className="py-2 pr-4 font-semibold">Requested</th>
                  <th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-900/5">
                {withdrawals.map((w) => (
                  <tr key={w.id}>
                    <td className="py-3 pr-4 font-mono text-xs text-ink-700">{w.reference}</td>
                    <td className="py-3 pr-4 font-medium tabular-nums">{formatNaira(w.amountKobo)}</td>
                    <td className="py-3 pr-4 text-ink-600">{w.destinationMasked ?? "—"}</td>
                    <td className="py-3 pr-4 text-xs tabular-nums text-ink-500">
                      {w.createdAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}
                    </td>
                    <td className="py-3">
                      <Badge
                        tone={
                          w.status === "COMPLETED"
                            ? "success"
                            : w.status === "FAILED"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {w.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-ink-500">
        This version records withdrawal <strong>requests</strong> and reserves the funds in the
        ledger. No automated bank payout is performed — a request is settled manually.
      </p>
    </div>
  );
}
