import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { BIZ_AUDIT, recordBusinessAudit } from "@/lib/business/audit";

/** SHA-256 of an invitation token — only the hash is ever stored. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class AgentError extends Error {}

/**
 * Creates a Branch Agent invitation for an email + branch and returns the raw
 * token (shown once, embedded in the link). Only the hash is persisted.
 */
export async function inviteAgent(input: {
  businessId: string;
  branchId: string;
  email: string;
  invitedByUserId: string;
}): Promise<{ token: string; invitationId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new AgentError("Enter a valid email address.");
  }
  // Branch must belong to this business.
  const branch = await prisma.merchant.findFirst({
    where: { id: input.branchId, businessId: input.businessId },
    select: { id: true },
  });
  if (!branch) throw new AgentError("That branch is not part of your business.");

  const token = randomBytes(32).toString("base64url");
  const invitation = await prisma.branchAgentInvitation.create({
    data: {
      businessId: input.businessId,
      branchId: input.branchId,
      email,
      tokenHash: hashToken(token),
      status: "PENDING",
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      invitedByUserId: input.invitedByUserId,
    },
  });
  await recordBusinessAudit({
    businessId: input.businessId,
    event: BIZ_AUDIT.AGENT_INVITED,
    actorUserId: input.invitedByUserId,
    branchId: input.branchId,
    metadata: { email },
  });
  return { token, invitationId: invitation.id };
}

export async function revokeInvite(
  businessId: string,
  invitationId: string,
  actorUserId: string
): Promise<void> {
  await prisma.branchAgentInvitation.updateMany({
    where: { id: invitationId, businessId, status: "PENDING" },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  await recordBusinessAudit({
    businessId,
    event: BIZ_AUDIT.AGENT_REVOKED,
    actorUserId,
    metadata: { invitationId },
  });
}

export interface InvitationView {
  businessName: string;
  branchName: string;
  email: string;
}

/** Resolves a raw token to a pending, unexpired invitation (or null). */
export async function lookupInvitation(token: string): Promise<
  | (InvitationView & { id: string; businessId: string; branchId: string; email: string })
  | null
> {
  const invitation = await prisma.branchAgentInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      business: { select: { name: true } },
      branch: { select: { name: true } },
    },
  });
  if (!invitation) return null;
  if (invitation.status !== "PENDING") return null;
  if (invitation.expiresAt.getTime() < Date.now()) return null;
  return {
    id: invitation.id,
    businessId: invitation.businessId,
    branchId: invitation.branchId,
    email: invitation.email,
    businessName: invitation.business.name,
    branchName: invitation.branch.name,
  };
}

/**
 * Accepts an invitation for the signed-in user. The user's email must match the
 * invited email. Activates a BRANCH_AGENT membership + a single active branch
 * assignment (replacing any prior assignment — v1 is one branch per agent).
 */
export async function acceptInvitation(input: {
  token: string;
  userId: string;
  userEmail: string;
}): Promise<{ businessId: string; branchId: string }> {
  const invitation = await lookupInvitation(input.token);
  if (!invitation) throw new AgentError("This invitation is invalid, expired, or already used.");
  if (invitation.email.toLowerCase() !== input.userEmail.trim().toLowerCase()) {
    throw new AgentError("This invitation was sent to a different email address.");
  }

  await prisma.$transaction(
    async (tx) => {
    // Re-check inside the tx to prevent double-accept races.
    const fresh = await tx.branchAgentInvitation.findUnique({
      where: { id: invitation.id },
      select: { status: true },
    });
    if (fresh?.status !== "PENDING") {
      throw new AgentError("This invitation is no longer valid.");
    }

    const membership = await tx.businessMembership.upsert({
      where: {
        businessId_userId: { businessId: invitation.businessId, userId: input.userId },
      },
      update: { status: "ACTIVE" },
      create: {
        businessId: invitation.businessId,
        userId: input.userId,
        role: "BRANCH_AGENT",
        status: "ACTIVE",
      },
    });

    // One active branch per agent: deactivate others, then (re)assign.
    await tx.branchAssignment.updateMany({
      where: { membershipId: membership.id, active: true },
      data: { active: false, revokedAt: new Date() },
    });
    await tx.branchAssignment.upsert({
      where: {
        membershipId_branchId: { membershipId: membership.id, branchId: invitation.branchId },
      },
      update: { active: true, revokedAt: null },
      create: { membershipId: membership.id, branchId: invitation.branchId, active: true },
    });

    await tx.branchAgentInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    await recordBusinessAudit({
      businessId: invitation.businessId,
      event: BIZ_AUDIT.AGENT_ASSIGNED,
      actorUserId: input.userId,
      branchId: invitation.branchId,
      tx,
    });
    },
    // The remote DB is high-latency; give the multi-write accept room.
    { timeout: 25_000, maxWait: 10_000 }
  );

  return { businessId: invitation.businessId, branchId: invitation.branchId };
}

async function assertAgentMembership(businessId: string, membershipId: string) {
  const membership = await prisma.businessMembership.findFirst({
    where: { id: membershipId, businessId, role: "BRANCH_AGENT" },
  });
  if (!membership) throw new AgentError("Agent not found in this business.");
  return membership;
}

export async function suspendAgent(businessId: string, membershipId: string, actorUserId: string) {
  await assertAgentMembership(businessId, membershipId);
  await prisma.businessMembership.update({
    where: { id: membershipId },
    data: { status: "SUSPENDED" },
  });
  await recordBusinessAudit({
    businessId,
    event: BIZ_AUDIT.AGENT_SUSPENDED,
    actorUserId,
    metadata: { membershipId },
  });
}

export async function reactivateAgent(businessId: string, membershipId: string, actorUserId: string) {
  await assertAgentMembership(businessId, membershipId);
  await prisma.businessMembership.update({
    where: { id: membershipId },
    data: { status: "ACTIVE" },
  });
  await recordBusinessAudit({
    businessId,
    event: BIZ_AUDIT.AGENT_REACTIVATED,
    actorUserId,
    metadata: { membershipId },
  });
}

export async function removeAgent(businessId: string, membershipId: string, actorUserId: string) {
  await assertAgentMembership(businessId, membershipId);
  await prisma.businessMembership.update({
    where: { id: membershipId },
    data: { status: "REVOKED" },
  });
  await prisma.branchAssignment.updateMany({
    where: { membershipId, active: true },
    data: { active: false, revokedAt: new Date() },
  });
  await recordBusinessAudit({
    businessId,
    event: BIZ_AUDIT.AGENT_REVOKED,
    actorUserId,
    metadata: { membershipId },
  });
}

/** Moves an agent to a different branch (still one active assignment). */
export async function moveAgentBranch(
  businessId: string,
  membershipId: string,
  branchId: string,
  actorUserId: string
) {
  await assertAgentMembership(businessId, membershipId);
  const branch = await prisma.merchant.findFirst({
    where: { id: branchId, businessId },
    select: { id: true },
  });
  if (!branch) throw new AgentError("That branch is not part of your business.");
  await prisma.$transaction(async (tx) => {
    await tx.branchAssignment.updateMany({
      where: { membershipId, active: true },
      data: { active: false, revokedAt: new Date() },
    });
    await tx.branchAssignment.upsert({
      where: { membershipId_branchId: { membershipId, branchId } },
      update: { active: true, revokedAt: null },
      create: { membershipId, branchId, active: true },
    });
    await recordBusinessAudit({
      businessId,
      event: BIZ_AUDIT.AGENT_ASSIGNED,
      actorUserId,
      branchId,
      metadata: { membershipId, moved: true },
      tx,
    });
  });
}
