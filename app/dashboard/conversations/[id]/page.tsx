import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMerchantSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Card, stateTone } from "@/components/ui";
import { toggleAutomationAction } from "../actions";
import { ReplyForm } from "./reply-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conversation" };

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getMerchantSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const conversation = await prisma.conversation.findFirst({
    where: { id, merchantId: session.merchantId },
    include: {
      customer: true,
      messages: { orderBy: { createdAt: "asc" }, take: 200 },
      orders: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!conversation) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/dashboard/conversations"
            className="text-sm font-medium text-ink-500 hover:text-brand-700"
          >
            ← Conversations
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">
            {conversation.customer.name ?? conversation.customer.phoneNumber}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={conversation.automationMode === "HUMAN" ? "info" : "neutral"}>
            {conversation.automationMode === "HUMAN" ? "Human mode" : "Bot mode"}
          </Badge>
          <Badge tone={stateTone(conversation.state)}>{conversation.state}</Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Transcript">
            {conversation.messages.length === 0 ? (
              <p className="text-sm text-ink-500">No messages yet.</p>
            ) : (
              <ul className="space-y-3">
                {conversation.messages.map((message) => (
                  <li
                    key={message.id}
                    className={`flex ${message.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm ${
                        message.direction === "OUTBOUND"
                          ? "rounded-tr-sm bg-brand-50 text-ink-900 ring-1 ring-brand-200"
                          : "rounded-tl-sm bg-ink-900/5 text-ink-900"
                      }`}
                    >
                      {message.textBody ?? `[${message.type.toLowerCase()}]`}
                      <p className="mt-1 text-right text-[10px] text-ink-500">
                        {message.createdAt.toLocaleTimeString("en-NG", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {message.direction === "OUTBOUND"
                          ? ` · ${message.status.toLowerCase()}`
                          : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-6 border-t border-ink-900/10 pt-4">
              <ReplyForm conversationId={conversation.id} />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Automation">
            <p className="text-sm text-ink-500">
              {conversation.automationMode === "HUMAN"
                ? "You're handling this chat. The assistant stays silent until you resume automation."
                : "The assistant is handling this chat. Take over to reply personally."}
            </p>
            <form action={toggleAutomationAction} className="mt-3">
              <input
                type="hidden"
                name="conversationId"
                value={conversation.id}
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                {conversation.automationMode === "HUMAN"
                  ? "Resume automation"
                  : "Take over chat"}
              </button>
            </form>
            {conversation.pendingQuestion ? (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
                Pending question to customer: {conversation.pendingQuestion}
              </p>
            ) : null}
          </Card>

          <Card title="Related orders">
            {conversation.orders.length === 0 ? (
              <p className="text-sm text-ink-500">No orders yet.</p>
            ) : (
              <ul className="space-y-2">
                {conversation.orders.map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-2">
                    <Link
                      href={`/dashboard/orders/${order.id}`}
                      className="font-mono text-sm font-semibold text-brand-700 hover:underline"
                    >
                      {order.reference}
                    </Link>
                    <Badge tone={stateTone(order.state)}>{order.state}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
