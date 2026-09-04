import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { Badge, Card, EmptyState, stateTone } from "@/components/ui";
import { getDashboardScope, scopedBranchIds } from "@/lib/business/scope";
import { AutoRefresh } from "./auto-refresh";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conversations" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "attention", label: "Needs attention" },
  { key: "human", label: "Human" },
  { key: "bot", label: "Bot" },
  { key: "payment", label: "Payment pending" },
  { key: "completed", label: "Completed" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

/** Prisma condition selecting the conversations for a filter tab. */
function filterWhere(filter: FilterKey): Prisma.ConversationWhereInput {
  switch (filter) {
    case "unread":
      return {
        OR: [
          { AND: [{ lastInboundAt: { not: null } }, { lastReadAt: null }] },
          { lastInboundAt: { gt: prisma.conversation.fields.lastReadAt } },
        ],
      };
    case "attention":
      return { state: "HUMAN_REQUIRED" };
    case "human":
      return { automationMode: "HUMAN" };
    case "bot":
      return { automationMode: "AUTO" };
    case "payment":
      return { state: "PAYMENT_PENDING" };
    case "completed":
      return { state: "COMPLETED" };
    default:
      return {};
  }
}

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const scope = await getDashboardScope();
  if (!scope) redirect("/dashboard");
  const branchIds = scopedBranchIds(scope);
  const showBranch = branchIds.length > 1;

  const { filter: filterParam, q } = await searchParams;
  const filter: FilterKey =
    (FILTERS.find((f) => f.key === filterParam)?.key as FilterKey) ?? "all";
  const query = q?.trim() ?? "";

  const searchWhere: Prisma.ConversationWhereInput = query
    ? {
        OR: [
          { customer: { name: { contains: query, mode: "insensitive" } } },
          { customer: { phoneNumber: { contains: query } } },
          { customer: { waId: { contains: query } } },
          { messages: { some: { textBody: { contains: query, mode: "insensitive" } } } },
          { orders: { some: { reference: { contains: query, mode: "insensitive" } } } },
        ],
      }
    : {};

  const baseWhere: Prisma.ConversationWhereInput = {
    merchantId: { in: branchIds },
  };
  const where: Prisma.ConversationWhereInput = {
    ...baseWhere,
    AND: [filterWhere(filter), searchWhere],
  };

  const [conversations, unreadCount] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: {
        customer: true,
        merchant: { select: { name: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.conversation.count({
      where: { ...baseWhere, ...filterWhere("unread") },
    }),
  ]);

  const qs = (key: FilterKey) =>
    `?filter=${key}${query ? `&q=${encodeURIComponent(query)}` : ""}`;

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={6000} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">
          Conversations
        </h1>
        {unreadCount > 0 ? <Badge tone="info">{unreadCount} unread</Badge> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <Link
              key={f.key}
              href={qs(f.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? "bg-brand-600 text-white"
                  : "bg-ink-900/5 text-ink-600 hover:bg-ink-900/10"
              }`}
            >
              {f.label}
              {f.key === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
            </Link>
          );
        })}
      </div>

      <Card>
        <form method="GET" className="mb-4 flex gap-3">
          <input type="hidden" name="filter" value={filter} />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search name, number, order ref or message…"
            aria-label="Search conversations"
            className="flex-1 rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Search
          </button>
        </form>

        {conversations.length === 0 ? (
          <EmptyState
            title="No conversations match"
            hint="Chats appear when customers message your WhatsApp number."
          />
        ) : (
          <ul className="divide-y divide-ink-900/5">
            {conversations.map((conversation) => {
              const isUnread =
                conversation.lastInboundAt !== null &&
                (conversation.lastReadAt === null ||
                  conversation.lastInboundAt > conversation.lastReadAt);
              return (
                <li key={conversation.id}>
                  <Link
                    href={`/dashboard/conversations/${conversation.id}`}
                    className="flex items-center justify-between gap-3 py-3 hover:bg-brand-50/40"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          isUnread ? "bg-brand-500" : "bg-transparent"
                        }`}
                      />
                      <div className="min-w-0">
                        <p
                          className={`truncate ${isUnread ? "font-bold text-ink-900" : "font-medium text-ink-900"}`}
                        >
                          {conversation.customer.name ??
                            conversation.customer.phoneNumber}
                          {isUnread ? <span className="sr-only"> (unread)</span> : null}
                        </p>
                        <p className="truncate text-sm text-ink-500">
                          {showBranch ? (
                            <span className="mr-1 font-medium text-ink-400">
                              {conversation.merchant.name} ·
                            </span>
                          ) : null}
                          {conversation.messages[0]?.textBody ?? "…"}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {conversation.automationMode === "HUMAN" ? (
                        <Badge tone="info">Human</Badge>
                      ) : (
                        <Badge tone="neutral">Auto</Badge>
                      )}
                      <Badge tone={stateTone(conversation.state)}>
                        {conversation.state}
                      </Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
