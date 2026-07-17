import { redirect } from "next/navigation";
import { getMerchantSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env, integrationStatus } from "@/lib/env";
import { nvidiaHealthCheck } from "@/lib/ai/nvidia";
import { getAccessToken } from "@/lib/monnify/auth";
import { validateBankAccount } from "@/lib/monnify/account-validation";
import { authedRequest, isFeatureUnavailable } from "@/lib/monnify/auth";
import { settlementCapabilityProbe } from "@/lib/monnify/settlements";
import { Badge, Card } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integration health" };

type Status =
  | "Connected"
  | "Configured"
  | "Missing"
  | "Permission denied"
  | "Feature activation required"
  | "Provider unavailable";

interface Row {
  name: string;
  status: Status;
  detail?: string;
  lastCheck?: Date | null;
}

function tone(status: Status): "success" | "warning" | "danger" | "neutral" {
  if (status === "Connected" || status === "Configured") return "success";
  if (status === "Feature activation required") return "warning";
  if (status === "Missing" || status === "Provider unavailable") return "neutral";
  return "danger";
}

export default async function HealthPage() {
  const session = await getMerchantSession();
  if (!session) redirect("/login");
  const now = new Date();
  const config = integrationStatus();
  const rows: Row[] = [];

  // Database
  try {
    await prisma.$queryRaw`SELECT 1`;
    rows.push({ name: "Database", status: "Connected", lastCheck: now });
  } catch {
    rows.push({ name: "Database", status: "Provider unavailable" });
  }

  // WhatsApp configuration + outbound API reachability (read-only probe)
  if (!config.whatsapp.configured) {
    rows.push({
      name: "WhatsApp configuration",
      status: "Missing",
      detail: `Missing: ${config.whatsapp.missing.join(", ")}`,
    });
  } else {
    rows.push({ name: "WhatsApp configuration", status: "Configured" });
    try {
      const e = env();
      const response = await fetch(
        `https://graph.facebook.com/${e.WHATSAPP_GRAPH_VERSION}/${e.WHATSAPP_PHONE_NUMBER_ID}?fields=id`,
        {
          headers: { Authorization: `Bearer ${e.WHATSAPP_ACCESS_TOKEN}` },
          signal: AbortSignal.timeout(8_000),
        }
      );
      rows.push({
        name: "WhatsApp outbound API",
        status: response.ok
          ? "Connected"
          : response.status === 401 || response.status === 403
            ? "Permission denied"
            : "Provider unavailable",
        detail: response.ok ? undefined : `HTTP ${response.status}`,
        lastCheck: now,
      });
    } catch {
      rows.push({ name: "WhatsApp outbound API", status: "Provider unavailable" });
    }
  }

  // Recent inbound WhatsApp webhook
  const lastWa = await prisma.webhookEvent.findFirst({
    where: { provider: "WHATSAPP" },
    orderBy: { createdAt: "desc" },
  });
  rows.push({
    name: "WhatsApp inbound webhook",
    status: lastWa ? "Connected" : "Missing",
    detail: lastWa ? undefined : "No inbound event recorded yet",
    lastCheck: lastWa?.createdAt ?? null,
  });

  // NVIDIA
  if (!config.nvidia.configured) {
    rows.push({ name: "NVIDIA NIM", status: "Missing" });
  } else {
    const ok = await nvidiaHealthCheck();
    rows.push({
      name: "NVIDIA NIM",
      status: ok ? "Connected" : "Provider unavailable",
      lastCheck: ok ? now : null,
    });
  }

  // Monnify auth
  let monnifyAuthed = false;
  if (!config.monnify.configured) {
    rows.push({
      name: "Monnify authentication",
      status: "Missing",
      detail: `Missing: ${config.monnify.missing.join(", ")}`,
    });
  } else {
    try {
      await getAccessToken();
      monnifyAuthed = true;
      rows.push({ name: "Monnify authentication", status: "Connected", lastCheck: now });
    } catch {
      rows.push({ name: "Monnify authentication", status: "Permission denied" });
    }
    rows.push({
      name: "Monnify contract code",
      status: env().MONNIFY_CONTRACT_CODE ? "Configured" : "Missing",
    });
  }

  if (monnifyAuthed) {
    // Bank validation capability (probe with an intentionally invalid account)
    const probe = await validateBankAccount("0000000000", "058");
    rows.push({
      name: "Bank account validation",
      status:
        probe.status === "VALIDATED" || probe.status === "INVALID_ACCOUNT"
          ? "Connected"
          : probe.status === "FEATURE_UNAVAILABLE"
            ? "Feature activation required"
            : "Provider unavailable",
      lastCheck: now,
    });

    // Subaccount API
    try {
      await authedRequest("/api/v1/sub-accounts");
      rows.push({ name: "Subaccount API", status: "Connected", lastCheck: now });
    } catch (err) {
      rows.push({
        name: "Subaccount API",
        status: isFeatureUnavailable(err)
          ? "Feature activation required"
          : "Provider unavailable",
      });
    }

    // Payment initialization + verification (config + last real evidence)
    const lastPayment = await prisma.payment.findFirst({
      where: { order: { merchantId: session.merchantId }, provider: "MONNIFY" },
      orderBy: { createdAt: "desc" },
    });
    rows.push({
      name: "Payment initialization",
      status: "Configured",
      detail: lastPayment
        ? `Last invoice ${lastPayment.invoiceReference}`
        : "No live initialization for this merchant yet",
      lastCheck: lastPayment?.createdAt ?? null,
    });
    const lastVerified = await prisma.payment.findFirst({
      where: {
        order: { merchantId: session.merchantId },
        verifiedAt: { not: null },
      },
      orderBy: { verifiedAt: "desc" },
    });
    rows.push({
      name: "Transaction verification",
      status: "Configured",
      detail: lastVerified ? undefined : "No verified transaction yet",
      lastCheck: lastVerified?.verifiedAt ?? null,
    });

    // Settlement capability
    const settlement = await settlementCapabilityProbe();
    rows.push({
      name: "Settlement capability",
      status:
        settlement.status === "AVAILABLE"
          ? "Connected"
          : settlement.status === "UNAVAILABLE"
            ? "Feature activation required"
            : "Provider unavailable",
      lastCheck: settlement.status === "AVAILABLE" ? now : null,
    });
  }

  // Recent Monnify webhook
  const lastMonnify = await prisma.webhookEvent.findFirst({
    where: { provider: "MONNIFY" },
    orderBy: { createdAt: "desc" },
  });
  rows.push({
    name: "Monnify webhook",
    status: lastMonnify ? "Connected" : "Missing",
    detail: lastMonnify ? undefined : "No webhook event recorded yet",
    lastCheck: lastMonnify?.createdAt ?? null,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">
          Integration health
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Live diagnostics. Statuses only — key values and full account numbers
          are never shown.
        </p>
      </div>

      <Card>
        <ul className="divide-y divide-ink-900/5">
          {rows.map((row) => (
            <li
              key={row.name}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <div>
                <p className="text-sm font-medium text-ink-900">{row.name}</p>
                {row.detail ? (
                  <p className="text-xs text-ink-500">{row.detail}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                {row.lastCheck ? (
                  <span className="text-xs tabular-nums text-ink-500">
                    Last successful check:{" "}
                    {row.lastCheck.toLocaleString("en-NG", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                ) : null}
                <Badge tone={tone(row.status)}>{row.status}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
