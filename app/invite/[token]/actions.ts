"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { acceptInvitation, AgentError } from "@/lib/business/agents";

export interface AcceptState {
  error: string | null;
}

export async function acceptInviteAction(
  _prev: AcceptState,
  formData: FormData
): Promise<AcceptState> {
  const token = String(formData.get("token") ?? "");
  const session = await getSession();
  if (!session) {
    redirect(`/login?next=/invite/${encodeURIComponent(token)}`);
  }
  try {
    await acceptInvitation({
      token,
      userId: session.userId,
      userEmail: session.email,
    });
  } catch (err) {
    return {
      error: err instanceof AgentError ? err.message : "Could not accept the invitation.",
    };
  }
  redirect("/dashboard");
}
