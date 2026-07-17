import { redirect } from "next/navigation";
import { Landmark } from "lucide-react";
import { getMerchantSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBanks, type Bank } from "@/lib/monnify/banks";
import { Badge, Card, EmptyState } from "@/components/ui";
import { ReplaceAccountForm } from "./replace-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settlement account" };

const FALLBACK_BANKS: Bank[] = [
  { name: "Access Bank", code: "044" },
  { name: "Guaranty Trust Bank", code: "058" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "Kuda Microfinance Bank", code: "50211" },
  { name: "Moniepoint MFB", code: "50515" },
  { name: "Opay Digital Services", code: "999992" },
  { name: "United Bank For Africa", code: "033" },
  { name: "Zenith Bank", code: "057" },
];

function statusTone(
  status: string
): "success" | "warning" | "danger" | "neutral" {
  if (status === "ACTIVE" || status === "VALIDATED") return "success";
  if (status === "ACTIVATION_REQUIRED" || status === "PENDING_VALIDATION")
    return "warning";
  if (status === "FAILED" || status === "VALIDATION_FAILED") return "danger";
  return "neutral";
}

export default async function SettlementPage() {
  const session = await getMerchantSession();
  if (!session) redirect("/login");

  const profiles = await prisma.merchantPaymentProfile.findMany({
    where: { merchantId: session.merchantId },
    orderBy: { createdAt: "desc" },
  });
  const active = profiles.find((p) => p.active) ?? profiles[0] ?? null;
  const history = profiles.filter((p) => p.id !== active?.id);

  let banks = FALLBACK_BANKS;
  try {
    banks = await getBanks();
  } catch {
    banks = FALLBACK_BANKS;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        Settlement account
      </h1>

      <Card title="Current account">
        {!active ? (
          <EmptyState
            title="No settlement account yet"
            hint="Add one below — Monnify validates the account name and creates your subaccount."
          />
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-500">Bank</dt>
              <dd className="mt-1 flex items-center gap-2 font-semibold text-ink-900">
                <Landmark className="h-4 w-4 text-brand-700" aria-hidden />
                {active.bankName}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-500">
                Account number
              </dt>
              <dd className="mt-1 font-mono font-semibold text-ink-900">
                {active.accountNumberMasked}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-500">
                Resolved account name
              </dt>
              <dd className="mt-1 font-semibold text-ink-900">
                {active.accountName ?? "Not yet resolved"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-500">
                Validation
              </dt>
              <dd className="mt-1">
                <Badge tone={statusTone(active.validationStatus)}>
                  {active.validationStatus.replace(/_/g, " ")}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-500">
                Subaccount
              </dt>
              <dd className="mt-1">
                <Badge tone={statusTone(active.subaccountStatus)}>
                  {active.subaccountStatus.replace(/_/g, " ")}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-500">
                Last validated
              </dt>
              <dd className="mt-1 text-sm text-ink-700">
                {active.lastValidatedAt
                  ? active.lastValidatedAt.toLocaleString("en-NG")
                  : "Never"}
              </dd>
            </div>
          </dl>
        )}
        {active?.subaccountStatus === "ACTIVATION_REQUIRED" ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            The Monnify Sub Account feature is not enabled on the platform
            sandbox account. Until it is activated (Monnify dashboard or
            support), merchant-routed checkout stays paused and payments fall
            back to platform routing with a visible warning.
          </p>
        ) : null}
      </Card>

      <Card title="Replace account">
        <ReplaceAccountForm banks={banks} />
      </Card>

      {history.length > 0 ? (
        <Card title="History">
          <ul className="divide-y divide-ink-900/5">
            {history.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span className="text-ink-700">
                  {p.bankName} · <span className="font-mono">{p.accountNumberMasked}</span>
                  {p.accountName ? ` · ${p.accountName}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={statusTone(p.subaccountStatus)}>
                    {p.subaccountStatus.replace(/_/g, " ")}
                  </Badge>
                  <span className="text-xs text-ink-500">
                    {p.createdAt.toLocaleDateString("en-NG")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
