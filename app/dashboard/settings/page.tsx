import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env, integrationStatus, isDemoMode } from "@/lib/env";
import { nvidiaHealthCheck } from "@/lib/ai/nvidia";
import { monnifyHealthCheck } from "@/lib/monnify/client";
import { Badge, Card } from "@/components/ui";
import {
  DemoResetWidget,
  ReconcileWidget,
  TestSendWidget,
} from "./settings-widgets";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const merchant = await prisma.merchant.findUniqueOrThrow({
    where: { id: session.merchantId },
  });
  const integrations = integrationStatus();
  const appUrl = env().APP_URL;

  // Live connectivity probes (short timeouts, never expose values).
  const [nvidiaLive, monnifyLive] = await Promise.all([
    integrations.nvidia.configured ? nvidiaHealthCheck() : Promise.resolve(false),
    integrations.monnify.configured ? monnifyHealthCheck() : Promise.resolve(false),
  ]);

  const rows: Array<{
    name: string;
    configured: boolean;
    live: boolean | null;
    missing: string[];
  }> = [
    {
      name: "WhatsApp Cloud API",
      configured: integrations.whatsapp.configured,
      live: null,
      missing: integrations.whatsapp.missing,
    },
    {
      name: "NVIDIA NIM",
      configured: integrations.nvidia.configured,
      live: nvidiaLive,
      missing: integrations.nvidia.missing,
    },
    {
      name: "Monnify (sandbox)",
      configured: integrations.monnify.configured,
      live: monnifyLive,
      missing: integrations.monnify.missing,
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        Settings
      </h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Merchant profile">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500">Business name</dt>
              <dd className="font-medium text-ink-900">{merchant.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Slug</dt>
              <dd className="font-mono">{merchant.slug}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Email</dt>
              <dd>{merchant.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Currency</dt>
              <dd>{merchant.currency}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Demo mode</dt>
              <dd>
                <Badge tone={isDemoMode() ? "warning" : "success"}>
                  {isDemoMode() ? "ENABLED (fixtures)" : "disabled"}
                </Badge>
              </dd>
            </div>
          </dl>
        </Card>

        <Card title="Integration health">
          <ul className="space-y-4">
            {rows.map((row) => (
              <li key={row.name}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink-700">
                    {row.name}
                  </span>
                  <span className="flex gap-2">
                    <Badge tone={row.configured ? "success" : "danger"}>
                      {row.configured ? "configured" : "missing config"}
                    </Badge>
                    {row.live !== null ? (
                      <Badge tone={row.live ? "success" : "warning"}>
                        {row.live ? "reachable" : "unreachable"}
                      </Badge>
                    ) : null}
                  </span>
                </div>
                {row.missing.length ? (
                  <p className="mt-1 text-xs text-ink-500">
                    Missing variables: {row.missing.join(", ")} (values are
                    never shown)
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Webhook callback URLs">
        <p className="text-sm text-ink-500">
          Configure these in the provider dashboards. They validate signatures
          and are never behind login.
        </p>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-medium text-ink-700">
              Meta (WhatsApp) — subscribe to <code>messages</code>
            </dt>
            <dd className="mt-1 break-all rounded-lg bg-ink-900/5 px-3 py-2 font-mono text-xs">
              {appUrl}/api/webhooks/whatsapp
            </dd>
            <p className="mt-1 text-xs text-ink-500">
              Verify token: the value of{" "}
              <code className="font-mono">WHATSAPP_VERIFY_TOKEN</code> (shown
              only in your environment configuration, never here).
            </p>
          </div>
          <div>
            <dt className="font-medium text-ink-700">Monnify transaction webhook</dt>
            <dd className="mt-1 break-all rounded-lg bg-ink-900/5 px-3 py-2 font-mono text-xs">
              {appUrl}/api/webhooks/monnify
            </dd>
          </div>
        </dl>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="WhatsApp test message">
          <TestSendWidget />
        </Card>
        <div className="space-y-6">
          <Card title="Payment reconciliation">
            <p className="mb-3 text-sm text-ink-500">
              Re-checks stale pending payments directly with Monnify — recovers
              orders whose webhook was missed.
            </p>
            <ReconcileWidget />
          </Card>
          <Card title="Demo data">
            <p className="mb-3 text-sm text-ink-500">
              Seeds one completed and one pending example order (tagged
              [DEMO], provider DEMO — clearly separated from real Monnify
              payments).
            </p>
            <DemoResetWidget />
          </Card>
        </div>
      </div>
    </div>
  );
}
