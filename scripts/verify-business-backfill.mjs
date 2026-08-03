#!/usr/bin/env node
/**
 * Read-only verification of the multi-branch backfill. Reports counts and any
 * integrity problems; exits non-zero if a hard problem is found.
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

const businesses = await prisma.business.count();
const linkedBranches = await prisma.merchant.count({ where: { businessId: { not: null } } });
const orphanBranches = await prisma.merchant.findMany({
  where: { businessId: null },
  select: { id: true, name: true, storeCode: true },
});
const merchants = await prisma.businessMembership.count({ where: { role: "MERCHANT" } });
const agents = await prisma.businessMembership.count({ where: { role: "BRANCH_AGENT" } });

// Users with a merchant membership but no business membership.
const usersWithMerchantMembership = await prisma.user.findMany({
  where: { memberships: { some: {} } },
  select: { id: true, email: true, businessMemberships: { select: { id: true } } },
});
const usersWithoutBusiness = usersWithMerchantMembership.filter(
  (u) => u.businessMemberships.length === 0
);

// Agents with more than one active branch assignment (v1 allows exactly one).
const agentMemberships = await prisma.businessMembership.findMany({
  where: { role: "BRANCH_AGENT" },
  select: { id: true, userId: true, branchAssignments: { where: { active: true } } },
});
const overAssigned = agentMemberships.filter((m) => m.branchAssignments.length > 1);

const ledgerEntries = await prisma.walletLedgerEntry.count();
const paidPayments = await prisma.payment.count({ where: { state: "PAID" } });

const report = {
  businesses,
  linkedBranches,
  orphanBranches: orphanBranches.length,
  merchantsMigrated: merchants,
  branchAgents: agents,
  usersWithoutBusinessMembership: usersWithoutBusiness.length,
  agentsOverAssigned: overAssigned.length,
  ledgerEntries,
  paidPayments,
};
console.log("Verification:", JSON.stringify(report, null, 2));
if (orphanBranches.length) {
  console.log("Orphan branches:", JSON.stringify(orphanBranches));
}
if (usersWithoutBusiness.length) {
  console.log("Users missing business membership:", usersWithoutBusiness.map((u) => u.email));
}

await prisma.$disconnect();

// Hard failures: an owner with no business membership, or an over-assigned agent.
const hardProblem = usersWithoutBusiness.length > 0 || overAssigned.length > 0;
process.exit(hardProblem ? 1 : 0);
