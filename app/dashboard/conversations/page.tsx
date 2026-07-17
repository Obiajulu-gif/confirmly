import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, EmptyState, stateTone } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conversations" };

export default async function ConversationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const conversations = await prisma.conversation.findMany({
    where: { merchantId: session.merchantId },
    include: {
      customer: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        Conversations
      </h1>
      <Card>
        {conversations.length === 0 ? (
          <EmptyState
            title="No conversations yet"
            hint="Chats appear when customers message your WhatsApp number."
          />
        ) : (
          <ul className="divide-y divide-ink-900/5">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <Link
                  href={`/dashboard/conversations/${conversation.id}`}
                  className="flex items-center justify-between gap-3 py-3 hover:bg-brand-50/40"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">
                      {conversation.customer.name ??
                        conversation.customer.phoneNumber}
                    </p>
                    <p className="truncate text-sm text-ink-500">
                      {conversation.messages[0]?.textBody ?? "…"}
                    </p>
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
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
