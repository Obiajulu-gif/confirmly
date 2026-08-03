import "server-only";
import { prisma } from "@/lib/db";
import { BIZ_AUDIT, recordBusinessAudit } from "@/lib/business/audit";

/**
 * Human takeover of a branch conversation. Concurrency-safe: the takeover is a
 * conditional updateMany so two agents racing for the same chat can't both win.
 */
export async function takeoverConversation(input: {
  conversationId: string;
  userId: string;
  businessId: string;
}): Promise<{ acquired: boolean }> {
  // Only acquire when nobody currently holds it (null, or previously released).
  const result = await prisma.conversation.updateMany({
    where: {
      id: input.conversationId,
      OR: [{ takenOverByUserId: null }, { takenOverByUserId: input.userId }],
    },
    data: {
      takenOverByUserId: input.userId,
      takenOverAt: new Date(),
      releasedAt: null,
      automationMode: "HUMAN",
      state: "HUMAN_ACTIVE",
    },
  });
  if (result.count === 0) return { acquired: false };

  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: { merchantId: true },
  });
  await recordBusinessAudit({
    businessId: input.businessId,
    event: BIZ_AUDIT.CHAT_TAKEN_OVER,
    actorUserId: input.userId,
    branchId: conversation?.merchantId ?? null,
    metadata: { conversationId: input.conversationId },
  });
  return { acquired: true };
}

/** Releases a conversation back to automation. Only the holder may release. */
export async function releaseConversation(input: {
  conversationId: string;
  userId: string;
  businessId: string;
}): Promise<{ released: boolean }> {
  const result = await prisma.conversation.updateMany({
    where: { id: input.conversationId, takenOverByUserId: input.userId },
    data: {
      takenOverByUserId: null,
      releasedAt: new Date(),
      automationMode: "AUTO",
      state: "COLLECTING_ORDER",
    },
  });
  if (result.count === 0) return { released: false };

  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: { merchantId: true },
  });
  await recordBusinessAudit({
    businessId: input.businessId,
    event: BIZ_AUDIT.CHAT_RELEASED,
    actorUserId: input.userId,
    branchId: conversation?.merchantId ?? null,
    metadata: { conversationId: input.conversationId },
  });
  return { released: true };
}
