import Link from "next/link";
import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { getMerchantSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { formatNaira } from "@/lib/money";
import { Badge, Card, EmptyState, stateTone } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const session = await getMerchantSession();
  if (!session) redirect("/login");

  const payments = await prisma.payment.findMany({
    where: { order: { merchantId: session.merchantId } },
    include: {
      order: { select: { id: true, reference: true } },
      settlement: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const platformFeePercent = env().MONNIFY_PLATFORM_FEE_PERCENT;
  const subaccountsEnabled = env().MONNIFY_SUBACCOUNT_ENABLED;
  const platformRouted = payments.filter(
    (p) => p.routedToPlatform && p.provider === "MONNIFY"
  ).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        Payments
      </h1>

      {!subaccountsEnabled || platformRouted > 0 ? (
        <div className="flex items-start gap-3 rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            {subaccountsEnabled
              ? `${platformRouted} payment(s) were routed to the platform Monnify account instead of your subaccount.`
              : "Merchant subaccount routing is currently disabled (Monnify Sub Account feature not active), so checkouts settle to the platform Monnify account and are reconciled manually. This banner disappears once subaccount routing is live."}
          </p>
        </div>
      ) : null}

      <Card>
        {payments.length === 0 ? (
          <EmptyState
            title="No payments yet"
            hint="Payments appear when customers confirm orders on WhatsApp."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-900/10 text-xs uppercase tracking-wide text-ink-500">
                  <th className="py-2 pr-4 font-semibold">Order</th>
                  <th className="py-2 pr-4 font-semibold">Gross</th>
                  <th className="py-2 pr-4 font-semibold">Monnify fee</th>
                  <th className="py-2 pr-4 font-semibold">
                    Platform fee ({platformFeePercent}%)
                  </th>
                  <th className="py-2 pr-4 font-semibold">Settlement amount</th>
                  <th className="py-2 pr-4 font-semibold">Payment</th>
                  <th className="py-2 pr-4 font-semibold">Settlement</th>
                  <th className="py-2 font-semibold">Routing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-900/5">
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-brand-50/40">
                    <td className="py-3 pr-4">
                      <Link
                        href={`/dashboard/orders/${payment.order.id}`}
                        className="font-mono font-semibold text-brand-700 hover:underline"
                      >
                        {payment.order.reference}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      {formatNaira(
                        payment.settlement?.grossAmountKobo ??
                          payment.expectedAmountKobo
                      )}
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-ink-500">
                      {payment.settlement
                        ? formatNaira(payment.settlement.feeKobo)
                        : "—"}
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-ink-500">
                      {formatNaira(0)}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      {payment.settlement
                        ? formatNaira(payment.settlement.netAmountKobo)
                        : "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={stateTone(payment.state)}>
                        {payment.state}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4">
                      {payment.settlement ? (
                        <Badge
                          tone={
                            payment.settlement.state === "SETTLED"
                              ? "success"
                              : payment.settlement.state === "FAILED"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {payment.settlement.state === "PENDING"
                            ? "SETTLEMENT_PENDING"
                            : payment.settlement.state}
                        </Badge>
                      ) : (
                        <span className="text-xs text-ink-500">—</span>
                      )}
                    </td>
                    <td className="py-3">
                      {payment.provider === "DEMO" ? (
                        <Badge tone="neutral">demo</Badge>
                      ) : payment.routedToPlatform ? (
                        <Badge tone="warning">platform</Badge>
                      ) : payment.subAccountCodeSnapshot ? (
                        <Badge tone="success">subaccount</Badge>
                      ) : (
                        <span className="text-xs text-ink-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-ink-500">
        Payment verification and settlement are separate facts: a verified
        payment creates a pending settlement, and only a Monnify settlement
        event or reconciliation marks it settled.
      </p>
    </div>
  );
}
