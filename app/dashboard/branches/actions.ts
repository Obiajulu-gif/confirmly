"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireMerchantRole } from "@/lib/authz/business-access";
import {
  activateBranch,
  closeBranch,
  suspendBranch,
} from "@/lib/business/service";
import { BIZ_AUDIT, recordBusinessAudit } from "@/lib/business/audit";

const branchSchema = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.string().trim().max(60).optional().or(z.literal("")),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  supportEmail: z.string().trim().email().optional().or(z.literal("")),
  phoneNumber: z.string().trim().max(30).optional().or(z.literal("")),
  address: z.string().trim().max(240).optional().or(z.literal("")),
  stateRegion: z.string().trim().max(80).optional().or(z.literal("")),
});

export interface BranchFormState {
  ok: boolean;
  error: string | null;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 55) || "branch"
  );
}
function codeFrom(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]/gu, "")
      .toUpperCase()
      .slice(0, 18) || "BRANCH"
  );
}
async function uniqueIdentity(name: string) {
  const baseSlug = slugify(name);
  const baseCode = codeFrom(name);
  for (let i = 0; i < 50; i++) {
    const slug = `${baseSlug}${i === 0 ? "" : `-${i + 1}`}`.slice(0, 64);
    const storeCode = `${baseCode}${i === 0 ? "" : String(i + 1)}`.slice(0, 24);
    const existing = await prisma.merchant.findFirst({
      where: { OR: [{ slug }, { storeCode }] },
      select: { id: true },
    });
    if (!existing) return { slug, storeCode };
  }
  throw new Error("Could not generate a unique branch identity");
}

/** Creates a new branch under the Merchant's Business. */
export async function createBranchAction(
  _prev: BranchFormState,
  formData: FormData
): Promise<BranchFormState> {
  const session = await requireMerchantRole().catch(() => null);
  if (!session) return { ok: false, error: "Only a Merchant can add branches." };

  const parsed = branchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  const data = parsed.data;
  const identity = await uniqueIdentity(data.name);

  const branch = await prisma.$transaction(async (tx) => {
    const created = await tx.merchant.create({
      data: {
        businessId: session.businessId,
        name: data.name,
        slug: identity.slug,
        storeCode: identity.storeCode,
        email: session.email,
        category: data.category || null,
        description: data.description || null,
        supportEmail: data.supportEmail || session.email,
        phoneNumber: data.phoneNumber || null,
        address: data.address || null,
        stateRegion: data.stateRegion || null,
        active: true,
        status: "ACTIVE",
        onboardedAt: new Date(),
      },
    });
    // The Merchant owns the branch (keeps the legacy membership model working).
    await tx.merchantMembership.create({
      data: { userId: session.userId, merchantId: created.id, role: "OWNER" },
    });
    await recordBusinessAudit({
      businessId: session.businessId,
      event: BIZ_AUDIT.BRANCH_LINKED,
      actorUserId: session.userId,
      branchId: created.id,
      metadata: { name: created.name, created: true },
      tx,
    });
    return created;
  });

  revalidatePath("/dashboard/branches");
  redirect(`/dashboard/branches/${branch.id}`);
}

export async function suspendBranchAction(formData: FormData): Promise<void> {
  const session = await requireMerchantRole();
  const branchId = String(formData.get("branchId") ?? "");
  const branch = await prisma.merchant.findFirst({
    where: { id: branchId, businessId: session.businessId },
    select: { id: true },
  });
  if (!branch) return;
  await suspendBranch(session.businessId, branchId, session.userId);
  revalidatePath("/dashboard/branches");
  revalidatePath(`/dashboard/branches/${branchId}`);
}

export async function activateBranchAction(formData: FormData): Promise<void> {
  const session = await requireMerchantRole();
  const branchId = String(formData.get("branchId") ?? "");
  const branch = await prisma.merchant.findFirst({
    where: { id: branchId, businessId: session.businessId },
    select: { id: true },
  });
  if (!branch) return;
  await activateBranch(session.businessId, branchId, session.userId);
  revalidatePath("/dashboard/branches");
  revalidatePath(`/dashboard/branches/${branchId}`);
}

export async function closeBranchAction(formData: FormData): Promise<void> {
  const session = await requireMerchantRole();
  const branchId = String(formData.get("branchId") ?? "");
  const branch = await prisma.merchant.findFirst({
    where: { id: branchId, businessId: session.businessId },
    select: { id: true },
  });
  if (!branch) return;
  await closeBranch(session.businessId, branchId, session.userId);
  revalidatePath("/dashboard/branches");
  revalidatePath(`/dashboard/branches/${branchId}`);
}
