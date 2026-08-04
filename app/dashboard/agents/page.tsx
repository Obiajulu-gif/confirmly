import { redirect } from "next/navigation";
import { requireMerchantRole, BusinessAccessError } from "@/lib/authz/business-access";
import { prisma } from "@/lib/db";
import { Badge, Card, EmptyState } from "@/components/ui";
import { InviteForm } from "./invite-form";
import {
  reactivateAgentAction,
  removeAgentAction,
  revokeInviteAction,
  suspendAgentAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agents" };

export default async function AgentsPage() {
  const session = await requireMerchantRole().catch((err) => {
    if (err instanceof BusinessAccessError) return null;
    throw err;
  });
  if (!session) redirect("/dashboard");

  const [branches, agents, invites] = await Promise.all([
    prisma.merchant.findMany({
      where: { businessId: session.businessId, status: { not: "CLOSED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.businessMembership.findMany({
      where: { businessId: session.businessId, role: "BRANCH_AGENT", status: { not: "REVOKED" } },
      include: {
        user: { select: { name: true, email: true } },
        branchAssignments: {
          where: { active: true },
          include: { branch: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.branchAgentInvitation.findMany({
      where: { businessId: session.businessId, status: "PENDING" },
      include: { branch: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Branch Agents</h1>
        <p className="mt-1 text-sm text-ink-500">
          Invite a person to manage one branch. Agents can&apos;t view other branches, wallet, or
          settings.
        </p>
      </div>

      <Card title="Invite a Branch Agent">
        <InviteForm branches={branches} />
      </Card>

      <Card title="Agents">
        {agents.length === 0 ? (
          <EmptyState title="No agents yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-900/10 text-xs uppercase tracking-wide text-ink-500">
                  <th className="py-2 pr-4 font-semibold">Agent</th>
                  <th className="py-2 pr-4 font-semibold">Branch</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-900/5">
                {agents.map((a) => (
                  <tr key={a.id} className="hover:bg-brand-50/40">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-ink-900">{a.user.name}</p>
                      <p className="text-xs text-ink-500">{a.user.email}</p>
                    </td>
                    <td className="py-3 pr-4 text-ink-700">
                      {a.branchAssignments[0]?.branch.name ?? "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={a.status === "ACTIVE" ? "success" : "warning"}>
                        {a.status}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        {a.status === "ACTIVE" ? (
                          <form action={suspendAgentAction}>
                            <input type="hidden" name="membershipId" value={a.id} />
                            <button className="rounded-lg border border-ink-900/15 px-2.5 py-1 text-xs font-semibold text-ink-700 hover:bg-ink-900/5">
                              Suspend
                            </button>
                          </form>
                        ) : (
                          <form action={reactivateAgentAction}>
                            <input type="hidden" name="membershipId" value={a.id} />
                            <button className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700">
                              Reactivate
                            </button>
                          </form>
                        )}
                        <form action={removeAgentAction}>
                          <input type="hidden" name="membershipId" value={a.id} />
                          <button className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">
                            Remove
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {invites.length > 0 ? (
        <Card title="Pending invitations">
          <ul className="divide-y divide-ink-900/5 text-sm">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between py-2">
                <span>
                  <span className="font-medium text-ink-900">{inv.email}</span>{" "}
                  <span className="text-ink-500">→ {inv.branch.name}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-ink-500">
                    expires {inv.expiresAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}
                  </span>
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="invitationId" value={inv.id} />
                    <button className="rounded-lg border border-ink-900/15 px-2.5 py-1 text-xs font-semibold text-ink-700 hover:bg-ink-900/5">
                      Revoke
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
