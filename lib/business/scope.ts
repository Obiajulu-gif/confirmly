import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import {
  accessibleBranchIds,
  getBusinessSession,
  type BusinessSession,
} from "@/lib/authz/business-access";
import type { BranchStatus } from "@prisma/client";

export const BRANCH_COOKIE = "confirmly_branch";

export interface ScopeBranch {
  id: string;
  name: string;
  active: boolean;
  status: BranchStatus;
}

export interface DashboardScope {
  session: BusinessSession;
  role: "MERCHANT" | "BRANCH_AGENT";
  /** Every branch the caller may access. */
  branchIds: string[];
  branches: ScopeBranch[];
  /** The branch currently in view; null means "All Branches" (Merchant only). */
  activeBranchId: string | null;
}

/**
 * Resolves the dashboard scope from the business session + the branch cookie.
 * A Branch Agent is always pinned to their assigned branch; a Merchant may pick
 * a branch or "All Branches". The cookie is validated against real access, so a
 * forged value cannot widen scope.
 */
export async function getDashboardScope(): Promise<DashboardScope | null> {
  const session = await getBusinessSession();
  if (!session) return null;

  const branchIds = await accessibleBranchIds(session);
  const branches = await prisma.merchant.findMany({
    where: { id: { in: branchIds } },
    select: { id: true, name: true, active: true, status: true },
    orderBy: { name: "asc" },
  });

  let activeBranchId: string | null = null;
  if (session.role === "BRANCH_AGENT") {
    activeBranchId = session.assignedBranchId;
  } else {
    const cookie = (await cookies()).get(BRANCH_COOKIE)?.value ?? "all";
    activeBranchId =
      cookie !== "all" && branchIds.includes(cookie) ? cookie : null;
  }

  return { session, role: session.role, branchIds, branches, activeBranchId };
}

/** Branch ids the current view covers: the active branch, or all accessible. */
export function scopedBranchIds(scope: DashboardScope): string[] {
  return scope.activeBranchId ? [scope.activeBranchId] : scope.branchIds;
}

export interface BranchContext {
  userId: string;
  email: string;
  role: "MERCHANT" | "BRANCH_AGENT";
  /** The single branch this page edits. */
  branchId: string;
  branchName: string;
  /** True when the Merchant is viewing "All Branches" and this defaulted. */
  defaulted: boolean;
  branches: ScopeBranch[];
  activeBranchId: string | null;
}

/**
 * Resolves the single branch a per-branch editing page targets, authorized for
 * the caller. A Branch Agent gets their assigned branch; a Merchant gets the
 * selected branch (or the first branch when in "All Branches" mode).
 */
export async function getBranchContext(): Promise<BranchContext | null> {
  const scope = await getDashboardScope();
  if (!scope) return null;
  const branchId = scope.activeBranchId ?? scope.branchIds[0] ?? null;
  if (!branchId) return null;
  const branchName = scope.branches.find((b) => b.id === branchId)?.name ?? "Branch";
  return {
    userId: scope.session.userId,
    email: scope.session.email,
    role: scope.role,
    branchId,
    branchName,
    defaulted: scope.role === "MERCHANT" && !scope.activeBranchId,
    branches: scope.branches,
    activeBranchId: scope.activeBranchId,
  };
}
