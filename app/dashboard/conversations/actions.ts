"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AUDIT, recordAudit } from "@/lib/orders/audit";
import { sendToCustomer } from "@/lib/orders/outbound";

export async function toggleAutomationAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const id = String(formData.get("conversationId") ?? "");
  const conversation = await prisma.conversation.findFirst({
    where: { id, merchantId: session.merchantId },
  });
  if (!conversation) return;

  const toHuman = conversation.automationMode === "AUTO";
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      automationMode: toHuman ? "HUMAN" : "AUTO",
      state: toHuman ? "HUMAN_ACTIVE" : "COLLECTING_ORDER",
    },
  });
  await recordAudit({
    merchantId: session.merchantId,
    conversationId: conversation.id,
    event: toHuman ? AUDIT.HUMAN_TAKEOVER : AUDIT.AUTOMATION_RESUMED,
    actor: "MERCHANT",
  });
  revalidatePath(`/dashboard/conversations/${conversation.id}`);
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
  const session = await getSession();
  if (!session) return { error: "unauthorized", ok: false };
  const parsed = replySchema.safeParse({
    conversationId: formData.get("conversationId"),
    text: formData.get("text"),
  });
  if (!parsed.success) return { error: "enter a message", ok: false };

  const conversation = await prisma.conversation.findFirst({
    where: { id: parsed.data.conversationId, merchantId: session.merchantId },
    include: { customer: true },
  });
  if (!conversation) return { error: "conversation not found", ok: false };

  try {
    await sendToCustomer({
      merchantId: session.merchantId,
      customer: conversation.customer,
      conversationId: conversation.id,
      kind: "text",
      text: parsed.data.text,
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "send failed",
      ok: false,
    };
  }
  revalidatePath(`/dashboard/conversations/${conversation.id}`);
  return { error: null, ok: true };
}
