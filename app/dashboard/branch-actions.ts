"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getBusinessSession, accessibleBranchIds } from "@/lib/authz/business-access";
import { BRANCH_COOKIE } from "@/lib/business/scope";

/**
 * Sets the Merchant's active branch (or "all"). Branch Agents cannot change
 * scope. The value is validated against real branch access before it is stored.
 */
export async function setActiveBranchAction(formData: FormData): Promise<void> {
  const session = await getBusinessSession();
  if (!session || session.role !== "MERCHANT") return;

  const value = String(formData.get("branchId") ?? "all");
  const store = await cookies();
  if (value === "all") {
    store.set(BRANCH_COOKIE, "all", { httpOnly: true, sameSite: "lax", path: "/" });
  } else {
    const branchIds = await accessibleBranchIds(session);
    if (branchIds.includes(value)) {
      store.set(BRANCH_COOKIE, value, { httpOnly: true, sameSite: "lax", path: "/" });
    }
  }
  revalidatePath("/dashboard");
}
