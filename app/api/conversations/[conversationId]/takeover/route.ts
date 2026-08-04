import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessBranch, getBusinessSession } from "@/lib/authz/business-access";
import { takeoverConversation } from "@/lib/business/conversations";

export const runtime = "nodejs";

/** Take over a branch conversation (concurrency-safe). Branch-scoped. */
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

  const result = await takeoverConversation({
    conversationId,
    userId: session.userId,
    businessId: session.businessId,
  });
  if (!result.acquired) {
    return NextResponse.json(
      { error: "already taken over by someone else" },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
