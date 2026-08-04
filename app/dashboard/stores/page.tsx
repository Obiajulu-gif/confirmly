import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Stores were renamed to Branches in the multi-branch model. */
export default function StoresPage() {
  redirect("/dashboard/branches");
}
