#!/usr/bin/env node
/**
 * Idempotent backfill for the multi-branch model. Safe to re-run.
 *
 *   1. Wrap each owner's branches (Merchant rows) in one Business.
 *   2. OWNER MerchantMembership  -> BusinessMembership(MERCHANT).
 *   3. STAFF MerchantMembership  -> BusinessMembership(BRANCH_AGENT) + BranchAssignment.
 *   4. Mirror Merchant.status from Merchant.active.
 *   5. Seed WalletLedgerEntry(PAYMENT_CREDIT) from every verified PAID payment.
 *
 * Never deletes or rewrites existing rows; uses upserts + unique guards.
 * Loads DATABASE_URL from .env (Prisma Client does not auto-load it).
 */
import { readFileSync } from "node:fs";

for (const f of [".env", ".env.local"]) {
  try {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^DATABASE_URL=(.*)$/);
      if (m && !process.env.DATABASE_URL) {
        process.env.DATABASE_URL = m[1].trim().replace(/^"(.*)"$/, "$1");
      }
    }
  } catch {}
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

function slugify(value) {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 55) || "business"
  );
}

/** Longest shared leading word sequence across branch names (for "Jide …"). */
function commonName(names) {
  if (names.length === 1) return names[0];
  const wordLists = names.map((n) => n.trim().split(/\s+/));
  const first = wordLists[0];
  const prefix = [];
  for (let i = 0; i < first.length; i++) {
    const w = first[i];
    if (wordLists.every((wl) => (wl[i] ?? "").toLowerCase() === w.toLowerCase())) {
      prefix.push(w);
    } else break;
  }
  const joined = prefix.join(" ").trim();
  return joined.length >= 3 ? joined : names[0];
}

async function uniqueBusinessSlug(name) {
  const base = slugify(name);
  for (let i = 0; i < 100; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const exists = await prisma.business.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) return slug;
  }
  return `${base}-${Date.now()}`;
}

const stats = {
  businessesCreated: 0,
  branchesLinked: 0,
  merchantMemberships: 0,
  agentMemberships: 0,
  branchAssignments: 0,
  ledgerEntries: 0,
  statusMirrored: 0,
};

// --- 1 & 2: owners -> Business + MERCHANT membership, link their branches ----
const owners = await prisma.merchantMembership.findMany({
  where: { role: "OWNER" },
  include: { user: true, merchant: true },
  orderBy: { createdAt: "asc" },
});

// Group owned merchants by userId.
const byUser = new Map();
for (const m of owners) {
  const list = byUser.get(m.userId) ?? [];
  list.push(m.merchant);
  byUser.set(m.userId, list);
}

for (const [userId, branches] of byUser) {
  // Reuse an existing Business if any of these branches already belongs to one.
  let businessId =
    branches.find((b) => b.businessId)?.businessId ?? null;

  if (!businessId) {
    const user = owners.find((o) => o.userId === userId)?.user;
    const name = commonName(branches.map((b) => b.name));
    const slug = await uniqueBusinessSlug(name);
    const business = await prisma.business.create({
      data: {
        name,
        slug,
        supportEmail: user?.email ?? null,
      },
    });
    businessId = business.id;
    stats.businessesCreated++;
  }

  // Link any unlinked branches.
  const toLink = branches.filter((b) => !b.businessId);
  if (toLink.length) {
    await prisma.merchant.updateMany({
      where: { id: { in: toLink.map((b) => b.id) } },
      data: { businessId },
    });
    stats.branchesLinked += toLink.length;
  }

  // Ensure a MERCHANT membership.
  const existing = await prisma.businessMembership.findUnique({
    where: { businessId_userId: { businessId, userId } },
  });
  if (!existing) {
    await prisma.businessMembership.create({
      data: { businessId, userId, role: "MERCHANT", status: "ACTIVE" },
    });
    stats.merchantMemberships++;
  } else if (existing.role !== "MERCHANT") {
    await prisma.businessMembership.update({
      where: { id: existing.id },
      data: { role: "MERCHANT" },
    });
  }
}

// --- 3: STAFF -> BRANCH_AGENT membership + assignment ------------------------
const staff = await prisma.merchantMembership.findMany({
  where: { role: "STAFF" },
  include: { merchant: true },
  orderBy: { createdAt: "asc" },
});

for (const s of staff) {
  const businessId = s.merchant.businessId;
  if (!businessId) continue; // branch has no owner/business — skip (flagged in verify)

  let membership = await prisma.businessMembership.findUnique({
    where: { businessId_userId: { businessId, userId: s.userId } },
  });
  if (!membership) {
    membership = await prisma.businessMembership.create({
      data: { businessId, userId: s.userId, role: "BRANCH_AGENT", status: "ACTIVE" },
    });
    stats.agentMemberships++;
  }
  // MERCHANTs access all branches; only agents get explicit assignments.
  if (membership.role === "BRANCH_AGENT") {
    const assignment = await prisma.branchAssignment.findUnique({
      where: {
        membershipId_branchId: { membershipId: membership.id, branchId: s.merchantId },
      },
    });
    if (!assignment) {
      await prisma.branchAssignment.create({
        data: { membershipId: membership.id, branchId: s.merchantId, active: true },
      });
      stats.branchAssignments++;
    }
  }
}

// --- 4: mirror branch status from active ------------------------------------
const suspended = await prisma.merchant.updateMany({
  where: { active: false, status: "ACTIVE" },
  data: { status: "SUSPENDED" },
});
stats.statusMirrored = suspended.count;

// --- 5: seed ledger from verified PAID payments -----------------------------
const paid = await prisma.payment.findMany({
  where: { state: "PAID" },
  include: { order: { select: { merchantId: true, merchant: { select: { businessId: true } } } } },
});
for (const p of paid) {
  const businessId = p.order?.merchant?.businessId;
  if (!businessId) continue;
  const existing = await prisma.walletLedgerEntry.findUnique({
    where: { type_paymentId: { type: "PAYMENT_CREDIT", paymentId: p.id } },
  });
  if (existing) continue;
  await prisma.walletLedgerEntry.create({
    data: {
      businessId,
      branchId: p.order.merchantId,
      type: "PAYMENT_CREDIT",
      amountKobo: p.paidAmountKobo > 0 ? p.paidAmountKobo : p.expectedAmountKobo,
      paymentId: p.id,
      memo: "Verified payment (backfill)",
    },
  });
  stats.ledgerEntries++;
}

console.log("Backfill complete:", JSON.stringify(stats, null, 2));
await prisma.$disconnect();
