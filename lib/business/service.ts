import "server-only";
import { prisma } from "@/lib/db";
import { randomCode } from "@/lib/references";
import { BIZ_AUDIT, recordBusinessAudit } from "@/lib/business/audit";
import type { Prisma } from "@prisma/client";

/** Unique slug for a Business name. */
async function uniqueBusinessSlug(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 55) || "business";
  for (let i = 0; i < 100; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const exists = await prisma.business.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!exists) return slug;
  }
  return `${base}-${Date.now()}`;
}

/**
 * Onboarding: create the Business, make the user its MERCHANT, and link the
 * chosen branches (only ones the user owns and that are not already linked).
 * Idempotent-ish: if the user already has a MERCHANT membership, reuse it.
 */
export async function createBusinessForOwner(input: {
  userId: string;
  email: string;
  name: string;
  legalName?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  address?: string | null;
  branchIds: string[];
}): Promise<{ businessId: string }> {
  const existing = await prisma.businessMembership.findFirst({
    where: { userId: input.userId, role: "MERCHANT", status: "ACTIVE" },
  });

  const businessId = await prisma.$transaction(async (tx) => {
    let bizId: string;
    if (existing) {
      bizId = existing.businessId;
      await tx.business.update({
        where: { id: bizId },
        data: {
          name: input.name,
          legalName: input.legalName || null,
          supportEmail: input.supportEmail || input.email,
          supportPhone: input.supportPhone || null,
          address: input.address || null,
        },
      });
    } else {
      const slug = await uniqueBusinessSlug(input.name);
      const business = await tx.business.create({
        data: {
          name: input.name,
          slug,
          legalName: input.legalName || null,
          supportEmail: input.supportEmail || input.email,
          supportPhone: input.supportPhone || null,
          address: input.address || null,
        },
      });
      bizId = business.id;
      await tx.businessMembership.create({
        data: {
          businessId: bizId,
          userId: input.userId,
          role: "MERCHANT",
          status: "ACTIVE",
        },
      });
    }

    // Link only branches the user owns and that are unlinked (or already ours).
    const owned = await tx.merchantMembership.findMany({
      where: { userId: input.userId, role: "OWNER", merchantId: { in: input.branchIds } },
      select: { merchantId: true },
    });
    const ownedIds = owned.map((m) => m.merchantId);
    if (ownedIds.length) {
      await tx.merchant.updateMany({
        where: { id: { in: ownedIds }, OR: [{ businessId: null }, { businessId: bizId }] },
        data: { businessId: bizId },
      });
    }

    await recordBusinessAudit({
      businessId: bizId,
      event: existing ? BIZ_AUDIT.BRANCH_LINKED : BIZ_AUDIT.BUSINESS_CREATED,
      actorUserId: input.userId,
      metadata: { branches: ownedIds.length },
      tx,
    });
    return bizId;
  });

  return { businessId };
}

// --- Consolidated metrics ---------------------------------------------------

export interface ConsolidatedMetrics {
  verifiedRevenueKobo: number;
  totalOrders: number;
  paidOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  openChats: number;
  chatsNeedingAttention: number;
  lowStock: number;
  outOfStock: number;
}

/** Aggregates verified-payment metrics across the given branch ids. */
export async function getConsolidatedMetrics(
  branchIds: string[]
): Promise<ConsolidatedMetrics> {
  if (branchIds.length === 0) {
    return {
      verifiedRevenueKobo: 0,
      totalOrders: 0,
      paidOrders: 0,
      pendingOrders: 0,
      cancelledOrders: 0,
      openChats: 0,
      chatsNeedingAttention: 0,
      lowStock: 0,
      outOfStock: 0,
    };
  }
  const where = { merchantId: { in: branchIds } };
  const [
    revenue,
    totalOrders,
    paidOrders,
    pendingOrders,
    cancelledOrders,
    openChats,
    chatsNeedingAttention,
    lowStock,
    outOfStock,
  ] = await Promise.all([
    prisma.order.aggregate({
      _sum: { totalKobo: true },
      where: { ...where, state: { in: ["PAID", "COMPLETED"] } },
    }),
    prisma.order.count({ where }),
    prisma.order.count({ where: { ...where, state: { in: ["PAID", "COMPLETED"] } } }),
    prisma.order.count({ where: { ...where, state: { in: ["PAYMENT_PENDING", "CONFIRMED"] } } }),
    prisma.order.count({ where: { ...where, state: "CANCELLED" } }),
    prisma.conversation.count({
      where: { ...where, state: { notIn: ["COMPLETED", "CANCELLED"] } },
    }),
    prisma.conversation.count({
      where: { ...where, state: { in: ["HUMAN_REQUIRED", "NEEDS_CLARIFICATION"] } },
    }),
    prisma.product.count({
      where: { ...where, active: true, stockQuantity: { gt: 0, lte: 5 } },
    }),
    prisma.product.count({ where: { ...where, active: true, stockQuantity: { lte: 0 } } }),
  ]);
  return {
    verifiedRevenueKobo: revenue._sum.totalKobo ?? 0,
    totalOrders,
    paidOrders,
    pendingOrders,
    cancelledOrders,
    openChats,
    chatsNeedingAttention,
    lowStock,
    outOfStock,
  };
}

/** Per-branch verified revenue + order counts for the comparison table. */
export async function getBranchComparison(branchIds: string[]) {
  if (branchIds.length === 0) return [];
  const branches = await prisma.merchant.findMany({
    where: { id: { in: branchIds } },
    select: { id: true, name: true, status: true, active: true },
    orderBy: { name: "asc" },
  });
  const revenue = await prisma.order.groupBy({
    by: ["merchantId"],
    _sum: { totalKobo: true },
    _count: { _all: true },
    where: { merchantId: { in: branchIds }, state: { in: ["PAID", "COMPLETED"] } },
  });
  const byBranch = new Map(revenue.map((r) => [r.merchantId, r]));
  return branches.map((b) => ({
    ...b,
    verifiedRevenueKobo: byBranch.get(b.id)?._sum.totalKobo ?? 0,
    paidOrders: byBranch.get(b.id)?._count._all ?? 0,
  }));
}

// --- Branch lifecycle -------------------------------------------------------

/** Reasons a branch cannot be closed yet (empty array => closable). */
export async function branchCloseBlockers(branchId: string): Promise<string[]> {
  const [openOrders, activeChats] = await Promise.all([
    prisma.order.count({
      where: {
        merchantId: branchId,
        state: { in: ["CONFIRMED", "PAYMENT_PENDING", "PAID", "NEEDS_ATTENTION", "FULFILLING"] },
      },
    }),
    prisma.conversation.count({
      where: { merchantId: branchId, state: { in: ["HUMAN_REQUIRED", "NEEDS_CLARIFICATION"] } },
    }),
  ]);
  const blockers: string[] = [];
  if (openOrders > 0) blockers.push(`${openOrders} open or unfulfilled order(s)`);
  if (activeChats > 0) blockers.push(`${activeChats} conversation(s) needing attention`);
  return blockers;
}

export async function suspendBranch(
  businessId: string,
  branchId: string,
  actorUserId: string
): Promise<void> {
  await prisma.merchant.update({
    where: { id: branchId },
    data: { active: false, status: "SUSPENDED" },
  });
  await recordBusinessAudit({
    businessId,
    event: BIZ_AUDIT.BRANCH_SUSPENDED,
    actorUserId,
    branchId,
  });
}

export async function activateBranch(
  businessId: string,
  branchId: string,
  actorUserId: string
): Promise<void> {
  await prisma.merchant.update({
    where: { id: branchId },
    data: { active: true, status: "ACTIVE" },
  });
  await recordBusinessAudit({
    businessId,
    event: BIZ_AUDIT.BRANCH_REACTIVATED,
    actorUserId,
    branchId,
  });
}

/** Closes a branch after verifying there are no open obligations. */
export async function closeBranch(
  businessId: string,
  branchId: string,
  actorUserId: string
): Promise<{ ok: boolean; blockers: string[] }> {
  const blockers = await branchCloseBlockers(branchId);
  if (blockers.length) return { ok: false, blockers };
  await prisma.merchant.update({
    where: { id: branchId },
    data: { active: false, status: "CLOSED" },
  });
  await recordBusinessAudit({
    businessId,
    event: BIZ_AUDIT.BRANCH_CLOSED,
    actorUserId,
    branchId,
  });
  return { ok: true, blockers: [] };
}

// --- Wallet & withdrawals ---------------------------------------------------

export interface WalletSummary {
  availableKobo: number;
  pendingWithdrawalKobo: number;
  withdrawnKobo: number;
  perBranch: Array<{ branchId: string; name: string; amountKobo: number }>;
}

export async function walletSummary(businessId: string): Promise<WalletSummary> {
  const [entriesAgg, credits, withdrawals] = await Promise.all([
    prisma.walletLedgerEntry.aggregate({
      _sum: { amountKobo: true },
      where: { businessId },
    }),
    prisma.walletLedgerEntry.groupBy({
      by: ["branchId"],
      _sum: { amountKobo: true },
      where: { businessId, type: "PAYMENT_CREDIT" },
    }),
    prisma.withdrawal.findMany({
      where: { businessId },
      select: { amountKobo: true, status: true },
    }),
  ]);

  const branchIds = credits.map((c) => c.branchId).filter((x): x is string => Boolean(x));
  const branchNames = new Map(
    (
      await prisma.merchant.findMany({
        where: { id: { in: branchIds } },
        select: { id: true, name: true },
      })
    ).map((b) => [b.id, b.name])
  );

  return {
    availableKobo: entriesAgg._sum.amountKobo ?? 0,
    pendingWithdrawalKobo: withdrawals
      .filter((w) => w.status === "REQUESTED" || w.status === "PROCESSING")
      .reduce((s, w) => s + w.amountKobo, 0),
    withdrawnKobo: withdrawals
      .filter((w) => w.status === "COMPLETED")
      .reduce((s, w) => s + w.amountKobo, 0),
    perBranch: credits.map((c) => ({
      branchId: c.branchId ?? "",
      name: branchNames.get(c.branchId ?? "") ?? "Unassigned",
      amountKobo: c._sum.amountKobo ?? 0,
    })),
  };
}

export class WithdrawalError extends Error {}

/**
 * Records an honest withdrawal REQUEST and reserves the funds with a ledger
 * debit. Does NOT move money — no Monnify payout is implemented. Status stays
 * REQUESTED for manual processing.
 */
export async function requestWithdrawal(input: {
  businessId: string;
  userId: string;
  amountKobo: number;
  destinationMasked?: string | null;
}): Promise<{ withdrawalId: string; reference: string }> {
  if (!Number.isInteger(input.amountKobo) || input.amountKobo <= 0) {
    throw new WithdrawalError("Enter a valid amount.");
  }
  const summary = await walletSummary(input.businessId);
  if (input.amountKobo > summary.availableKobo) {
    throw new WithdrawalError("Amount exceeds the available verified balance.");
  }
  const reference = `WD-${randomCode(12)}`;
  const result = await prisma.$transaction(async (tx) => {
    const withdrawal = await tx.withdrawal.create({
      data: {
        businessId: input.businessId,
        requestedByUserId: input.userId,
        amountKobo: input.amountKobo,
        status: "REQUESTED",
        destinationMasked: input.destinationMasked ?? null,
        reference,
      },
    });
    // Reserve funds so the balance can't be double-requested.
    await tx.walletLedgerEntry.create({
      data: {
        businessId: input.businessId,
        type: "WITHDRAWAL_DEBIT",
        amountKobo: -input.amountKobo,
        withdrawalId: withdrawal.id,
        memo: `Withdrawal request ${reference}`,
      },
    });
    await recordBusinessAudit({
      businessId: input.businessId,
      event: BIZ_AUDIT.WITHDRAWAL_REQUESTED,
      actorUserId: input.userId,
      metadata: { reference, amountKobo: input.amountKobo },
      tx,
    });
    return withdrawal;
  });
  return { withdrawalId: result.id, reference };
}

/**
 * Credits a verified payment into the business wallet ledger. Idempotent via
 * the unique (type, paymentId) constraint. No-op when the branch has no
 * Business yet.
 */
export async function creditPaymentToLedger(paymentId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      order: { select: { merchantId: true, merchant: { select: { businessId: true } } } },
    },
  });
  if (!payment || payment.state !== "PAID") return;
  const businessId = payment.order?.merchant?.businessId;
  if (!businessId) return;
  const data: Prisma.WalletLedgerEntryCreateInput = {
    business: { connect: { id: businessId } },
    branch: { connect: { id: payment.order.merchantId } },
    type: "PAYMENT_CREDIT",
    amountKobo: payment.paidAmountKobo > 0 ? payment.paidAmountKobo : payment.expectedAmountKobo,
    paymentId: payment.id,
    memo: "Verified payment",
  };
  await prisma.walletLedgerEntry.create({ data }).catch((err) => {
    // Unique violation = already credited; anything else re-throws.
    if (!(typeof err === "object" && err && "code" in err && (err as { code?: string }).code === "P2002")) {
      throw err;
    }
  });
}
