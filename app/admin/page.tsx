import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { Badge, Card, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin overview" };

/** Conversation states that count as an open/active WhatsApp chat. */
const ACTIVE_STATES = [
  "NEW",
  "COLLECTING_ORDER",
  "NEEDS_CLARIFICATION",
  "AWAITING_CONFIRMATION",
  "PAYMENT_PENDING",
  "FULFILLING",
  "HUMAN_REQUIRED",
  "HUMAN_ACTIVE",
] as const;

function stateLabel(state: string): string {
  const map: Record<string, string> = {
    NEW: "New",
    COLLECTING_ORDER: "Ordering",
    NEEDS_CLARIFICATION: "Clarifying",
    AWAITING_CONFIRMATION: "Confirming",
    PAYMENT_PENDING: "Payment",
    PAID: "Paid",
    FULFILLING: "Fulfilling",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    HUMAN_REQUIRED: "Needs human",
    HUMAN_ACTIVE: "With agent",
  };
  return map[state] ?? state;
}

function stateTone(state: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (state === "HUMAN_REQUIRED") return "danger";
  if (state === "PAID" || state === "COMPLETED") return "success";
  if (["NEEDS_CLARIFICATION", "AWAITING_CONFIRMATION", "PAYMENT_PENDING"].includes(state))
    return "warning";
  if (["NEW", "COLLECTING_ORDER", "FULFILLING", "HUMAN_ACTIVE"].includes(state)) return "info";
  return "neutral";
}

function timeAgo(date: Date | null): string {
  if (!date) return "—";
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Masks a WhatsApp number for cross-tenant admin display: 2348••••567. */
function maskNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6) return value;
  return `${digits.slice(0, 4)}••••${digits.slice(-3)}`;
}

export default async function AdminOverviewPage() {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    users,
    newUsers30d,
    customersOrdered,
    merchantsTotal,
    merchantsActive,
    totalOrders,
    orders30d,
    gmv,
    convByState,
    humanMode,
    inbound24h,
    outbound24h,
    liveChats,
    topMerchantGroups,
    recentSessions,
  ] = await Promise.all([
    prisma.waSession.count(),
    prisma.waSession.count({ where: { createdAt: { gte: since30d } } }),
    prisma.order.findMany({ distinct: ["customerId"], select: { customerId: true } }),
    prisma.merchant.count(),
    prisma.merchant.count({ where: { active: true } }),
    prisma.order.count(),
    prisma.order.count({ where: { createdAt: { gte: since30d } } }),
    prisma.order.aggregate({
      _sum: { totalKobo: true },
      where: { state: { in: ["PAID", "COMPLETED"] } },
    }),
    prisma.conversation.groupBy({ by: ["state"], _count: { _all: true } }),
    prisma.conversation.count({ where: { automationMode: "HUMAN" } }),
    prisma.whatsAppMessage.count({
      where: { direction: "INBOUND", createdAt: { gte: since24h } },
    }),
    prisma.whatsAppMessage.count({
      where: { direction: "OUTBOUND", createdAt: { gte: since24h } },
    }),
    prisma.conversation.findMany({
      where: { lastInboundAt: { not: null } },
      orderBy: { lastInboundAt: "desc" },
      take: 8,
      include: {
        merchant: { select: { name: true } },
        customer: { select: { name: true, waId: true } },
      },
    }),
    prisma.order.groupBy({
      by: ["merchantId"],
      _count: { _all: true },
      orderBy: { _count: { merchantId: "desc" } },
      take: 5,
    }),
    prisma.waSession.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  const stateCount = (s: string) => convByState.find((r) => r.state === s)?._count._all ?? 0;
  const totalChats = convByState.reduce((a, r) => a + r._count._all, 0);
  const activeChats = convByState
    .filter((r) => (ACTIVE_STATES as readonly string[]).includes(r.state))
    .reduce((a, r) => a + r._count._all, 0);
  const needsHuman = stateCount("HUMAN_REQUIRED");

  const topMerchants = topMerchantGroups.length
    ? await prisma.merchant.findMany({
        where: { id: { in: topMerchantGroups.map((g) => g.merchantId) } },
        select: { id: true, name: true, active: true },
      })
    : [];
  const topMerchantRows = topMerchantGroups
    .map((g) => ({
      count: g._count._all,
      merchant: topMerchants.find((m) => m.id === g.merchantId),
    }))
    .filter((r) => r.merchant);

  // Enrich recent WhatsApp users with their onboarding details (name/email).
  const userLeads = recentSessions.length
    ? await prisma.lead.findMany({
        where: { waId: { in: recentSessions.map((s) => s.waId) } },
        select: { waId: true, name: true, email: true },
      })
    : [];
  const recentUsers = recentSessions.map((s) => {
    const lead = userLeads.find((l) => l.waId === s.waId);
    return {
      id: s.id,
      name: lead?.name ?? s.profileName ?? null,
      number: maskNumber(s.waId),
      email: lead?.email ?? null,
      joined: s.createdAt,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Platform overview</h1>
        <p className="mt-1 text-sm text-ink-500">
          Users, WhatsApp chats and stores across Confirmly.
        </p>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Users"
          value={users.toLocaleString()}
          sub={`+${newUsers30d.toLocaleString()} in last 30 days`}
        />
        <StatCard
          label="Stores"
          value={merchantsActive.toLocaleString()}
          sub={`active of ${merchantsTotal.toLocaleString()} total`}
        />
        <StatCard
          label="Orders"
          value={totalOrders.toLocaleString()}
          sub={`+${orders30d.toLocaleString()} in last 30 days`}
        />
        <StatCard
          label="Revenue"
          value={formatNaira(gmv._sum.totalKobo ?? 0)}
          sub={`${customersOrdered.length.toLocaleString()} customers ordered`}
        />
      </div>

      {/* WhatsApp chat status */}
      <Card
        title="WhatsApp chats"
        action={
          <Link href="/admin/sessions" className="text-sm font-medium text-brand-700 hover:underline">
            WhatsApp numbers →
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-2xl font-bold tabular-nums text-ink-900">
              {activeChats.toLocaleString()}
            </p>
            <p className="text-xs text-ink-500">Active chats</p>
          </div>
          <div>
            <p
              className={`text-2xl font-bold tabular-nums ${needsHuman ? "text-red-700" : "text-ink-900"}`}
            >
              {needsHuman.toLocaleString()}
            </p>
            <p className="text-xs text-ink-500">Waiting for a human</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums text-ink-900">
              {humanMode.toLocaleString()}
            </p>
            <p className="text-xs text-ink-500">Handled by an agent</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums text-ink-900">
              {(inbound24h + outbound24h).toLocaleString()}
            </p>
            <p className="text-xs text-ink-500">
              Messages / 24h ({inbound24h.toLocaleString()} in · {outbound24h.toLocaleString()} out)
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-ink-900/5 pt-4">
          {totalChats === 0 ? (
            <span className="text-sm text-ink-500">No conversations yet.</span>
          ) : (
            convByState
              .slice()
              .sort((a, b) => b._count._all - a._count._all)
              .map((row) => (
                <Badge key={row.state} tone={stateTone(row.state)}>
                  {stateLabel(row.state)} · {row._count._all}
                </Badge>
              ))
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Live conversations */}
        <Card title="Recent conversations" className="lg:col-span-2">
          {liveChats.length === 0 ? (
            <p className="text-sm text-ink-500">No conversations yet.</p>
          ) : (
            <ul className="divide-y divide-ink-900/5 text-sm">
              {liveChats.map((chat) => (
                <li key={chat.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-900">
                      {chat.customer.name ?? chat.customer.waId}
                    </p>
                    <p className="truncate text-xs text-ink-500">{chat.merchant.name}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge tone={stateTone(chat.state)}>{stateLabel(chat.state)}</Badge>
                    <span className="w-16 text-right text-xs tabular-nums text-ink-500">
                      {timeAgo(chat.lastInboundAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Top stores */}
        <Card
          title="Top stores"
          action={
            <Link href="/admin/merchants" className="text-sm font-medium text-brand-700 hover:underline">
              All stores →
            </Link>
          }
        >
          {topMerchantRows.length === 0 ? (
            <p className="text-sm text-ink-500">No orders yet.</p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {topMerchantRows.map((row) => (
                <li key={row.merchant!.id} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium text-ink-900">{row.merchant!.name}</span>
                    {!row.merchant!.active ? <Badge tone="neutral">off</Badge> : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-ink-500">
                    {row.count.toLocaleString()} orders
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* User details */}
      <Card
        title="Recent users"
        action={
          <Link href="/admin/sessions" className="text-sm font-medium text-brand-700 hover:underline">
            All users →
          </Link>
        }
      >
        {recentUsers.length === 0 ? (
          <p className="text-sm text-ink-500">No users yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-900/10 text-xs uppercase tracking-wide text-ink-500">
                  <th className="py-2 pr-4 font-semibold">Name</th>
                  <th className="py-2 pr-4 font-semibold">Number</th>
                  <th className="py-2 pr-4 font-semibold">Email</th>
                  <th className="py-2 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-900/5">
                {recentUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-brand-50/40">
                    <td className="py-3 pr-4 font-medium text-ink-900">
                      {u.name ?? <span className="text-ink-500">Unknown</span>}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-ink-700">{u.number}</td>
                    <td className="py-3 pr-4 text-ink-700">
                      {u.email ?? <span className="text-ink-500">—</span>}
                    </td>
                    <td className="py-3 text-xs tabular-nums text-ink-500">
                      {u.joined.toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
