import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  accessibleBranchIds,
  canAccessBranch,
  type BusinessSession,
} from "@/lib/authz/business-access";
import {
  acceptInvitation,
  AgentError,
  inviteAgent,
  lookupInvitation,
} from "@/lib/business/agents";
import {
  branchCloseBlockers,
  closeBranch,
  creditPaymentToLedger,
  requestWithdrawal,
  suspendBranch,
  walletSummary,
  WithdrawalError,
} from "@/lib/business/service";
import {
  releaseConversation,
  takeoverConversation,
} from "@/lib/business/conversations";

/**
 * Multi-branch model: authorization, invitations, branch lifecycle, conversation
 * takeover concurrency, and wallet/withdrawal integrity. Real DB; no network.
 */

const tag = Date.now().toString(36);
let businessId: string;
let foreignBusinessId: string;
let branchAId: string;
let branchBId: string;
let foreignBranchId: string;
let ownerUserId: string;
let agentUserId: string;
let agentMembershipId: string;

async function makeBranch(name: string, bizId: string | null) {
  return prisma.merchant.create({
    data: {
      businessId: bizId ?? undefined,
      name,
      slug: `${name.toLowerCase().replace(/\s+/g, "-")}-${tag}-${Math.random().toString(36).slice(2, 6)}`,
      storeCode: `${name.replace(/\s+/g, "").toUpperCase().slice(0, 8)}${tag.toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`,
      email: `branch-${tag}@example.com`,
      active: true,
      status: "ACTIVE",
    },
  });
}

beforeAll(async () => {
  const owner = await prisma.user.create({
    data: { name: "Branch Owner", email: `owner-${tag}@example.com`, passwordHash: "x" },
  });
  ownerUserId = owner.id;
  const agent = await prisma.user.create({
    data: { name: "Branch Agent", email: `agent-${tag}@example.com`, passwordHash: "x" },
  });
  agentUserId = agent.id;

  const business = await prisma.business.create({
    data: { name: `Jide Food ${tag}`, slug: `jide-${tag}` },
  });
  businessId = business.id;
  const foreign = await prisma.business.create({
    data: { name: `Rival ${tag}`, slug: `rival-${tag}` },
  });
  foreignBusinessId = foreign.id;

  branchAId = (await makeBranch("Jide Lekki", businessId)).id;
  branchBId = (await makeBranch("Jide Yaba", businessId)).id;
  foreignBranchId = (await makeBranch("Rival VI", foreignBusinessId)).id;

  await prisma.businessMembership.create({
    data: { businessId, userId: ownerUserId, role: "MERCHANT", status: "ACTIVE" },
  });
  const agentMembership = await prisma.businessMembership.create({
    data: { businessId, userId: agentUserId, role: "BRANCH_AGENT", status: "ACTIVE" },
  });
  agentMembershipId = agentMembership.id;
  await prisma.branchAssignment.create({
    data: { membershipId: agentMembershipId, branchId: branchAId, active: true },
  });
});

afterAll(async () => {
  await prisma.merchant
    .deleteMany({ where: { id: { in: [branchAId, branchBId, foreignBranchId] } } })
    .catch(() => {});
  await prisma.business
    .deleteMany({ where: { id: { in: [businessId, foreignBusinessId] } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: [ownerUserId, agentUserId] } } })
    .catch(() => {});
});

function merchantSession(): BusinessSession {
  return {
    userId: ownerUserId,
    email: `owner-${tag}@example.com`,
    membershipId: "m",
    businessId,
    role: "MERCHANT",
    assignedBranchId: null,
  };
}
function agentSession(): BusinessSession {
  return {
    userId: agentUserId,
    email: `agent-${tag}@example.com`,
    membershipId: agentMembershipId,
    businessId,
    role: "BRANCH_AGENT",
    assignedBranchId: branchAId,
  };
}

describe("branch authorization", () => {
  it("a Merchant reaches every branch in their business, none outside it", async () => {
    expect(await canAccessBranch(merchantSession(), branchAId)).toBe(true);
    expect(await canAccessBranch(merchantSession(), branchBId)).toBe(true);
    expect(await canAccessBranch(merchantSession(), foreignBranchId)).toBe(false);
    const ids = await accessibleBranchIds(merchantSession());
    expect(ids.sort()).toEqual([branchAId, branchBId].sort());
  });

  it("a Branch Agent reaches only the assigned branch", async () => {
    expect(await canAccessBranch(agentSession(), branchAId)).toBe(true);
    expect(await canAccessBranch(agentSession(), branchBId)).toBe(false);
    expect(await canAccessBranch(agentSession(), foreignBranchId)).toBe(false);
    expect(await accessibleBranchIds(agentSession())).toEqual([branchAId]);
  });
});

describe("agent invitations", () => {
  it("hashes the token and enforces email match, one branch, and no replay", async () => {
    const invitee = await prisma.user.create({
      data: { name: "Invitee", email: `invitee-${tag}@example.com`, passwordHash: "x" },
    });
    try {
      const { token } = await inviteAgent({
        businessId,
        branchId: branchBId,
        email: `invitee-${tag}@example.com`,
        invitedByUserId: ownerUserId,
      });
      // Raw token is never stored.
      const stored = await prisma.branchAgentInvitation.findFirst({
        where: { businessId, email: `invitee-${tag}@example.com` },
      });
      expect(stored?.tokenHash).toBeTruthy();
      expect(stored?.tokenHash).not.toContain(token);

      // Wrong email is rejected.
      await expect(
        acceptInvitation({ token, userId: invitee.id, userEmail: "someone-else@example.com" })
      ).rejects.toBeInstanceOf(AgentError);

      // Correct email activates membership + a single active assignment.
      const result = await acceptInvitation({
        token,
        userId: invitee.id,
        userEmail: `invitee-${tag}@example.com`,
      });
      expect(result.branchId).toBe(branchBId);
      const membership = await prisma.businessMembership.findUniqueOrThrow({
        where: { businessId_userId: { businessId, userId: invitee.id } },
      });
      expect(membership.role).toBe("BRANCH_AGENT");
      const active = await prisma.branchAssignment.count({
        where: { membershipId: membership.id, active: true },
      });
      expect(active).toBe(1);

      // Replay is rejected (token now consumed).
      expect(await lookupInvitation(token)).toBeNull();
      await expect(
        acceptInvitation({ token, userId: invitee.id, userEmail: `invitee-${tag}@example.com` })
      ).rejects.toBeInstanceOf(AgentError);
    } finally {
      await prisma.user.delete({ where: { id: invitee.id } }).catch(() => {});
    }
  }, 90_000); // multi-write accept on the high-latency shared DB
});

describe("branch lifecycle", () => {
  it("suspending hides a branch from WhatsApp (active=false) and preserves it", async () => {
    await suspendBranch(businessId, branchBId, ownerUserId);
    const branch = await prisma.merchant.findUniqueOrThrow({ where: { id: branchBId } });
    expect(branch.active).toBe(false);
    expect(branch.status).toBe("SUSPENDED");
    // The WhatsApp store directory filters on active:true, so it's hidden.
    const visible = await prisma.merchant.findFirst({
      where: { id: branchBId, active: true },
    });
    expect(visible).toBeNull();
  });

  it("blocks closing a branch with an open order, allows it once clear", async () => {
    const customer = await prisma.customer.create({
      data: { merchantId: branchAId, waId: `wa-${tag}`, phoneNumber: `+234${tag}` },
    });
    const order = await prisma.order.create({
      data: {
        reference: `CFY-MB${tag.toUpperCase()}`,
        merchantId: branchAId,
        customerId: customer.id,
        state: "PAYMENT_PENDING",
        subtotalKobo: 1000,
        totalKobo: 1000,
      },
    });
    expect((await branchCloseBlockers(branchAId)).length).toBeGreaterThan(0);
    const blocked = await closeBranch(businessId, branchAId, ownerUserId);
    expect(blocked.ok).toBe(false);

    await prisma.order.update({ where: { id: order.id }, data: { state: "COMPLETED" } });
    const cleared = await closeBranch(businessId, branchAId, ownerUserId);
    expect(cleared.ok).toBe(true);
    const branch = await prisma.merchant.findUniqueOrThrow({ where: { id: branchAId } });
    expect(branch.status).toBe("CLOSED");
  });
});

describe("conversation takeover", () => {
  it("is concurrency-safe: only one holder wins, and the holder can release", async () => {
    const customer = await prisma.customer.create({
      data: { merchantId: branchAId, waId: `wa2-${tag}`, phoneNumber: `+234b${tag}` },
    });
    const conversation = await prisma.conversation.create({
      data: { merchantId: branchAId, customerId: customer.id, channel: "whatsapp", state: "NEW" },
    });

    const first = await takeoverConversation({
      conversationId: conversation.id,
      userId: ownerUserId,
      businessId,
    });
    expect(first.acquired).toBe(true);
    // A different user cannot steal an already-held chat.
    const second = await takeoverConversation({
      conversationId: conversation.id,
      userId: agentUserId,
      businessId,
    });
    expect(second.acquired).toBe(false);

    // The holder releases it back to automation.
    const released = await releaseConversation({
      conversationId: conversation.id,
      userId: ownerUserId,
      businessId,
    });
    expect(released.released).toBe(true);
    const fresh = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    expect(fresh.automationMode).toBe("AUTO");
    expect(fresh.takenOverByUserId).toBeNull();
  });
});

describe("wallet & withdrawals", () => {
  it("credits verified payments idempotently and reserves withdrawals", async () => {
    const customer = await prisma.customer.create({
      data: { merchantId: branchAId, waId: `wa3-${tag}`, phoneNumber: `+234c${tag}` },
    });
    const order = await prisma.order.create({
      data: {
        reference: `CFY-WAL${tag.toUpperCase()}`,
        merchantId: branchAId,
        customerId: customer.id,
        state: "PAID",
        subtotalKobo: 500_000,
        totalKobo: 500_000,
        payment: {
          create: {
            provider: "MONNIFY",
            state: "PAID",
            invoiceReference: `WALINV-${tag}`,
            expectedAmountKobo: 500_000,
            paidAmountKobo: 500_000,
          },
        },
      },
      include: { payment: true },
    });

    await creditPaymentToLedger(order.payment!.id);
    await creditPaymentToLedger(order.payment!.id); // idempotent
    const credits = await prisma.walletLedgerEntry.count({
      where: { paymentId: order.payment!.id, type: "PAYMENT_CREDIT" },
    });
    expect(credits).toBe(1);

    const before = await walletSummary(businessId);
    expect(before.availableKobo).toBeGreaterThanOrEqual(500_000);

    // Over-balance is rejected.
    await expect(
      requestWithdrawal({
        businessId,
        userId: ownerUserId,
        amountKobo: before.availableKobo + 1,
      })
    ).rejects.toBeInstanceOf(WithdrawalError);

    // A valid request reserves the funds (ledger debit).
    await requestWithdrawal({ businessId, userId: ownerUserId, amountKobo: 200_000 });
    const after = await walletSummary(businessId);
    expect(after.availableKobo).toBe(before.availableKobo - 200_000);
    expect(after.pendingWithdrawalKobo).toBeGreaterThanOrEqual(200_000);
  }, 90_000); // many round-trips on the high-latency shared DB
});
