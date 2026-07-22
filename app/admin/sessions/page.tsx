import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge, Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · WhatsApp numbers" };

function maskNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6) return value;
  return `${digits.slice(0, 4)}••••${digits.slice(-3)}`;
}

export default async function AdminSessionsPage() {
  const [sessions, activeStores] = await Promise.all([
    prisma.waSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.merchant.findMany({ select: { id: true, name: true } }),
  ]);
  const storeName = new Map(activeStores.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">
          WhatsApp numbers
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Every WhatsApp user who has messaged Confirmly ({sessions.length}{" "}
          shown).
        </p>
      </div>

      <Card>
        {sessions.length === 0 ? (
          <EmptyState
            title="No WhatsApp numbers yet"
            hint="Registrations appear when a customer first messages the number."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-900/10 text-xs uppercase tracking-wide text-ink-500">
                  <th className="py-2 pr-4 font-semibold">Number</th>
                  <th className="py-2 pr-4 font-semibold">Profile name</th>
                  <th className="py-2 pr-4 font-semibold">Active store</th>
                  <th className="py-2 pr-4 font-semibold">Registered</th>
                  <th className="py-2 font-semibold">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-900/5">
                {sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-brand-50/40">
                    <td className="py-3 pr-4 font-mono text-xs text-ink-700">
                      {maskNumber(session.waId)}
                    </td>
                    <td className="py-3 pr-4 text-ink-700">
                      {session.profileName ?? "—"}
                    </td>
                    <td className="py-3 pr-4">
                      {session.activeMerchantId ? (
                        <Badge tone="info">
                          {storeName.get(session.activeMerchantId) ?? "Unknown"}
                        </Badge>
                      ) : (
                        <span className="text-xs text-ink-500">None</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs tabular-nums text-ink-500">
                      {session.createdAt.toLocaleDateString("en-NG", {
                        dateStyle: "medium",
                      })}
                    </td>
                    <td className="py-3 text-xs tabular-nums text-ink-500">
                      {session.updatedAt.toLocaleString("en-NG", {
                        dateStyle: "short",
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
      <Link href="/admin" className="inline-block text-sm text-brand-700 hover:underline">
        ← Back to overview
      </Link>
    </div>
  );
}
