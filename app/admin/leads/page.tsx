import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge, Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Leads" };

/** Masks a WhatsApp number for display (keeps country + last 3 digits). */
function maskNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6) return value;
  return `${digits.slice(0, 4)}••••${digits.slice(-3)}`;
}

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { referralCode: { contains: q, mode: "insensitive" } },
              { waId: { contains: q } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.lead.count(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Leads</h1>
        <p className="mt-1 text-sm text-ink-500">
          Everyone who completed the WhatsApp onboarding — captured even before
          they pick a store or place an order. {total} total.
        </p>
      </div>

      <Card>
        <form method="GET" className="mb-4 flex gap-3">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name, email, referral or number…"
            aria-label="Search leads"
            className="flex-1 rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Search
          </button>
        </form>

        {leads.length === 0 ? (
          <EmptyState
            title="No leads yet"
            hint="New customers who complete the onboarding form appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-900/10 text-xs uppercase tracking-wide text-ink-500">
                  <th className="py-2 pr-4 font-semibold">Name</th>
                  <th className="py-2 pr-4 font-semibold">Email</th>
                  <th className="py-2 pr-4 font-semibold">Number</th>
                  <th className="py-2 pr-4 font-semibold">Referral</th>
                  <th className="py-2 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-900/5">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-brand-50/40">
                    <td className="py-3 pr-4 font-medium text-ink-900">
                      {lead.name ?? "—"}
                    </td>
                    <td className="py-3 pr-4 text-ink-700">{lead.email ?? "—"}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-ink-700">
                      {maskNumber(lead.waId)}
                    </td>
                    <td className="py-3 pr-4">
                      {lead.referralCode ? (
                        <Badge tone="info">{lead.referralCode}</Badge>
                      ) : (
                        <span className="text-ink-500">—</span>
                      )}
                    </td>
                    <td className="py-3 text-xs tabular-nums text-ink-500">
                      {lead.createdAt.toLocaleString("en-NG", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-ink-500">
        Numbers are masked. A lead becomes a customer once they select a store.
      </p>
      <Link
        href="/admin"
        className="inline-block text-sm text-brand-700 hover:underline"
      >
        ← Back to overview
      </Link>
    </div>
  );
}
