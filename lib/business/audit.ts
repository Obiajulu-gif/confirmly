import "server-only";
import { prisma, type TxClient } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** Canonical business-level audit event names. */
export const BIZ_AUDIT = {
  BUSINESS_CREATED: "BUSINESS_CREATED",
  BRANCH_LINKED: "BRANCH_LINKED",
  BRANCH_UNLINKED: "BRANCH_UNLINKED",
  BRANCH_SUSPENDED: "BRANCH_SUSPENDED",
  BRANCH_REACTIVATED: "BRANCH_REACTIVATED",
  BRANCH_CLOSED: "BRANCH_CLOSED",
  AGENT_INVITED: "AGENT_INVITED",
  AGENT_ASSIGNED: "AGENT_ASSIGNED",
  AGENT_SUSPENDED: "AGENT_SUSPENDED",
  AGENT_REACTIVATED: "AGENT_REACTIVATED",
  AGENT_REVOKED: "AGENT_REVOKED",
  PAYOUT_DETAILS_UPDATED: "PAYOUT_DETAILS_UPDATED",
  WITHDRAWAL_REQUESTED: "WITHDRAWAL_REQUESTED",
  WITHDRAWAL_COMPLETED: "WITHDRAWAL_COMPLETED",
  WITHDRAWAL_FAILED: "WITHDRAWAL_FAILED",
  CHAT_TAKEN_OVER: "CHAT_TAKEN_OVER",
  CHAT_RELEASED: "CHAT_RELEASED",
  PRODUCT_CREATED: "PRODUCT_CREATED",
  PRODUCT_UPDATED: "PRODUCT_UPDATED",
  STOCK_UPDATED: "STOCK_UPDATED",
} as const;

/** Records a business audit event. Never store secrets or full account numbers. */
export async function recordBusinessAudit(input: {
  businessId: string;
  event: string;
  actorUserId?: string | null;
  branchId?: string | null;
  metadata?: Prisma.InputJsonValue;
  tx?: TxClient;
}): Promise<void> {
  const db = input.tx ?? prisma;
  await db.businessAuditEvent.create({
    data: {
      businessId: input.businessId,
      event: input.event,
      actorUserId: input.actorUserId ?? null,
      branchId: input.branchId ?? null,
      metadata: input.metadata,
    },
  });
}
