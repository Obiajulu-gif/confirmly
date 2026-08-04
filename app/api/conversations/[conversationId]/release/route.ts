import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessBranch, getBusinessSession } from "@/lib/authz/business-access";
import { releaseConversation } from "@/lib/business/conversations";

export const runtime = "nodejs";

/** Release a conversation back to automation. Only the holder may release. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const session = await getBusinessSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { conversationId } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { merchantId: true },
  });
  if (!conversation || !(await canAccessBranch(session, conversation.merchantId))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const result = await releaseConversation({
    conversationId,
    userId: session.userId,
    businessId: session.businessId,
  });
  return NextResponse.json({ ok: result.released });
}
