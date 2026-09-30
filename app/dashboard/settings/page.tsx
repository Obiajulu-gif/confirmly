import { redirect } from "next/navigation";
import { getMerchantSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui";
import { StoreLogoWidget } from "./settings-widgets";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

/**
 * Merchant settings: only the merchant's own details and what they upload.
 * Platform internals (integration health, webhook URLs, test sends, demo
 * data) live in the admin console under Integrations.
 */
export default async function SettingsPage() {
  const session = await getMerchantSession();
  if (!session) redirect("/login");

  const merchant = await prisma.merchant.findUniqueOrThrow({
    where: { id: session.merchantId },
    include: { logoAsset: { select: { id: true } } },
  });

  const profile: Array<[string, string, string?]> = [
    ["Business name", merchant.name],
    ["Store code", merchant.storeCode, "font-mono"],
    ["Email", merchant.email],
    ["Currency", merchant.currency],
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        Settings
      </h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Store profile">
          <dl className="space-y-3 text-sm">
            {profile.map(([label, value, cls]) => (
              <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
                <dt className="text-ink-500">{label}</dt>
                <dd className={`min-w-0 break-all font-medium text-ink-900 ${cls ?? ""}`}>{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Store logo">
          <StoreLogoWidget
            merchantId={merchant.id}
            hasLogo={merchant.logoAsset !== null}
          />
        </Card>
      </div>
    </div>
  );
}
