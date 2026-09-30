import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { getDashboardScope } from "@/lib/business/scope";
import { buildWaLink } from "@/lib/orders/onboarding";
import { resolveWhatsAppPublicNumber } from "@/lib/whatsapp/client";
import { Card, EmptyState } from "@/components/ui";
import {
  StorefrontCard,
  type StorefrontLink,
} from "@/components/storefront-card";
import { StoreFlyerCard } from "@/components/store-flyer-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp store" };

export default async function StorefrontPage() {
  const scope = await getDashboardScope();
  if (!scope) redirect("/onboarding");

  const digits = await resolveWhatsAppPublicNumber().catch(() => null);

  const branches = await prisma.merchant.findMany({
    where: { id: { in: scope.branchIds } },
    select: { id: true, name: true, storeCode: true },
    orderBy: { name: "asc" },
  });

  const links: StorefrontLink[] = [];
  if (digits) {
    for (const branch of branches) {
      const waLink = buildWaLink(branch.storeCode, digits);
      if (!waLink) continue;
      const qrDataUrl = await QRCode.toDataURL(waLink, {
        width: 400,
        margin: 1,
        errorCorrectionLevel: "H",
        color: { dark: "#071019", light: "#ffffff" },
      });
      links.push({
        branchId: branch.id,
        storeName: branch.name,
        storeCode: branch.storeCode,
        waLink,
        qrDataUrl,
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">
          WhatsApp store
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Share this link or QR anywhere your customers find you. Each one opens
          WhatsApp straight in your store — ready to browse, order and pay.
        </p>
      </div>

      {!digits ? (
        <Card title="WhatsApp number not configured">
          <EmptyState
            title="No public WhatsApp number is set yet"
            hint="Once your Confirmly WhatsApp number is live, your shareable store link and QR code appear here automatically."
          />
        </Card>
      ) : links.length === 0 ? (
        <Card title="No stores yet">
          <EmptyState
            title="You don't have a store to share yet"
            hint="Create a branch to get its WhatsApp store link and QR code."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {links.map((link) => (
            <StorefrontCard key={link.branchId} link={link} />
          ))}
        </div>
      )}

      {branches.length ? (
        <section className="space-y-4" aria-labelledby="flyers-heading">
          <div>
            <h2 id="flyers-heading" className="text-lg font-bold tracking-tight text-ink-900">
              Announce that you&apos;ve joined Confirmly
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              A ready-made flyer for each store: share it with customers so they know where to order.
            </p>
          </div>
          {branches.map((branch) => (
            <StoreFlyerCard
              key={branch.id}
              branchId={branch.id}
              storeName={branch.name}
              storeCode={branch.storeCode}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
