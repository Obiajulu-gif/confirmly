"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  canAccessBranch,
  getBusinessSession,
} from "@/lib/authz/business-access";
import { sendToCustomer } from "@/lib/orders/outbound";
import {
  releaseConversation,
  takeoverConversation,
} from "@/lib/business/conversations";

/** Resolves + authorizes a conversation for the caller's branch access. */
async function authorizeConversation(conversationId: string) {
  const session = await getBusinessSession();
  if (!session) return null;
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { customer: true },
  });
  if (!conversation) return null;
  if (!(await canAccessBranch(session, conversation.merchantId))) return null;
  return { session, conversation };
}

/** Take over (to HUMAN) or release (to AUTO), branch-scoped + audited. */
export async function toggleAutomationAction(formData: FormData): Promise<void> {
  const id = String(formData.get("conversationId") ?? "");
  const ctx = await authorizeConversation(id);
  if (!ctx) return;

  if (ctx.conversation.automationMode === "AUTO") {
    await takeoverConversation({
      conversationId: id,
      userId: ctx.session.userId,
      businessId: ctx.session.businessId,
    });
  } else {
    await releaseConversation({
      conversationId: id,
      userId: ctx.session.userId,
      businessId: ctx.session.businessId,
    });
  }
  revalidatePath(`/dashboard/conversations/${id}`);
  revalidatePath("/dashboard/conversations");
}

const replySchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().min(1).max(2000),
});

export interface ReplyState {
  error: string | null;
  ok: boolean;
}

export async function sendMerchantReplyAction(
  _prev: ReplyState,
  formData: FormData
): Promise<ReplyState> {
  const parsed = replySchema.safeParse({
    conversationId: formData.get("conversationId"),
    text: formData.get("text"),
  });
  if (!parsed.success) return { error: "enter a message", ok: false };

  const ctx = await authorizeConversation(parsed.data.conversationId);
  if (!ctx) return { error: "conversation not found", ok: false };

  try {
    await sendToCustomer({
      merchantId: ctx.conversation.merchantId,
      customer: ctx.conversation.customer,
      conversationId: ctx.conversation.id,
      kind: "text",
      text: parsed.data.text,
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "send failed",
      ok: false,
    };
  }
  revalidatePath(`/dashboard/conversations/${ctx.conversation.id}`);
  return { error: null, ok: true };
}
