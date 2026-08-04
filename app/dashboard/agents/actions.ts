"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appUrl } from "@/lib/env";
import { requireMerchantRole } from "@/lib/authz/business-access";
import {
  AgentError,
  inviteAgent,
  moveAgentBranch,
  reactivateAgent,
  removeAgent,
  revokeInvite,
  suspendAgent,
} from "@/lib/business/agents";

export interface InviteState {
  error: string | null;
  /** The shareable invitation link (shown once — no email is sent in v1). */
  link: string | null;
}

const inviteSchema = z.object({
  email: z.string().trim().email(),
  branchId: z.string().min(1),
});

export async function inviteAgentAction(
  _prev: InviteState,
  formData: FormData
): Promise<InviteState> {
  const session = await requireMerchantRole().catch(() => null);
  if (!session) return { error: "Only a Merchant can invite agents.", link: null };

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    branchId: formData.get("branchId"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and choose a branch.", link: null };
  }
  try {
    const { token } = await inviteAgent({
      businessId: session.businessId,
      branchId: parsed.data.branchId,
      email: parsed.data.email,
      invitedByUserId: session.userId,
    });
    revalidatePath("/dashboard/agents");
    return { error: null, link: `${appUrl()}/invite/${token}` };
  } catch (err) {
    return {
      error: err instanceof AgentError ? err.message : "Could not create the invitation.",
      link: null,
    };
  }
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const session = await requireMerchantRole();
  await revokeInvite(session.businessId, String(formData.get("invitationId") ?? ""), session.userId);
  revalidatePath("/dashboard/agents");
}

export async function suspendAgentAction(formData: FormData): Promise<void> {
  const session = await requireMerchantRole();
  await suspendAgent(session.businessId, String(formData.get("membershipId") ?? ""), session.userId);
  revalidatePath("/dashboard/agents");
}

export async function reactivateAgentAction(formData: FormData): Promise<void> {
  const session = await requireMerchantRole();
  await reactivateAgent(session.businessId, String(formData.get("membershipId") ?? ""), session.userId);
  revalidatePath("/dashboard/agents");
}

export async function removeAgentAction(formData: FormData): Promise<void> {
  const session = await requireMerchantRole();
  await removeAgent(session.businessId, String(formData.get("membershipId") ?? ""), session.userId);
  revalidatePath("/dashboard/agents");
}

export async function moveAgentAction(formData: FormData): Promise<void> {
  const session = await requireMerchantRole();
  await moveAgentBranch(
    session.businessId,
    String(formData.get("membershipId") ?? ""),
    String(formData.get("branchId") ?? ""),
    session.userId
  ).catch(() => {});
  revalidatePath("/dashboard/agents");
}
