import "server-only";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can, type BusinessRole, type Capability } from "@/lib/authz/policy";

/**
 * Server-side business authorization. Everything is derived from the signed
 * session + the database — never from client-supplied businessId/branchId. A
 * suspended or revoked membership yields no session (access denied).
 */

export interface BusinessSession {
  userId: string;
  email: string;
  membershipId: string;
  businessId: string;
  role: BusinessRole;
  /** The one branch a Branch Agent may touch; null for a Merchant (all). */
  assignedBranchId: string | null;
}

export class BusinessAccessError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 = 403
  ) {
    super(message);
    this.name = "BusinessAccessError";
  }
}

/**
 * Resolves the caller's business context. When the session names an active
 * branch, the membership for that branch's business is preferred; otherwise
 * the first ACTIVE membership is used.
 */
export async function getBusinessSession(): Promise<BusinessSession | null> {
  const session = await getSession();
  if (!session) return null;

  const memberships = await prisma.businessMembership.findMany({
    where: { userId: session.userId, status: "ACTIVE" },
    include: { branchAssignments: { where: { active: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return null;

  // Prefer the membership owning the session's active branch.
  let chosen = memberships[0]!;
  if (session.merchantId) {
    const branch = await prisma.merchant.findUnique({
      where: { id: session.merchantId },
      select: { businessId: true },
    });
    const match = branch?.businessId
      ? memberships.find((m) => m.businessId === branch.businessId)
      : null;
    if (match) chosen = match;
  }

  const assignedBranchId =
    chosen.role === "BRANCH_AGENT"
      ? (chosen.branchAssignments[0]?.branchId ?? null)
      : null;

  return {
    userId: session.userId,
    email: session.email,
    membershipId: chosen.id,
    businessId: chosen.businessId,
    role: chosen.role,
    assignedBranchId,
  };
}

/** Throws 401 when there is no valid business session. */
export async function requireBusinessSession(): Promise<BusinessSession> {
  const session = await getBusinessSession();
  if (!session) throw new BusinessAccessError("Not signed in", 401);
  return session;
}

/** Throws 403 unless the caller is a Merchant. */
export async function requireMerchantRole(): Promise<BusinessSession> {
  const session = await requireBusinessSession();
  if (session.role !== "MERCHANT") {
    throw new BusinessAccessError("Merchant role required", 403);
  }
  return session;
}

/** True when the branch belongs to the caller's authority. */
export async function canAccessBranch(
  session: BusinessSession,
  branchId: string
): Promise<boolean> {
  if (!branchId) return false;
  if (session.role === "MERCHANT") {
    const branch = await prisma.merchant.findUnique({
      where: { id: branchId },
      select: { businessId: true },
    });
    return branch?.businessId === session.businessId;
  }
  // Branch Agent: only the assigned active branch.
  return session.assignedBranchId === branchId;
}

/** Throws 403 unless the caller may act on the branch. */
export async function requireBranchAccess(
  branchId: string
): Promise<BusinessSession> {
  const session = await requireBusinessSession();
  if (!(await canAccessBranch(session, branchId))) {
    throw new BusinessAccessError("No access to this branch", 403);
  }
  return session;
}

/** Branch ids the caller may read/write — for scoping list queries. */
export async function accessibleBranchIds(
  session: BusinessSession
): Promise<string[]> {
  if (session.role === "MERCHANT") {
    const branches = await prisma.merchant.findMany({
      where: { businessId: session.businessId },
      select: { id: true },
    });
    return branches.map((b) => b.id);
  }
  return session.assignedBranchId ? [session.assignedBranchId] : [];
}

/** Capability checks (business-wide powers). Branch scope is separate. */
export function hasCapability(
  session: BusinessSession,
  capability: Capability
): boolean {
  return can(session.role, capability);
}

export function canWithdraw(session: BusinessSession): boolean {
  return can(session.role, "initiate_withdrawal");
}

export function canManageAgents(session: BusinessSession): boolean {
  return can(session.role, "manage_agents");
}

export function canManageBusinessSettings(session: BusinessSession): boolean {
  return can(session.role, "change_business_settings");
}

/** Convenience for API routes: maps a thrown BusinessAccessError to a status. */
export function accessErrorStatus(err: unknown): 401 | 403 | null {
  return err instanceof BusinessAccessError ? err.status : null;
}
