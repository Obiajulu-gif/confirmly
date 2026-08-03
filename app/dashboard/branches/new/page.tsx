import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMerchantRole, BusinessAccessError } from "@/lib/authz/business-access";
import { BranchCreateForm } from "../branch-create-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add branch" };

export default async function NewBranchPage() {
  const session = await requireMerchantRole().catch((err) => {
    if (err instanceof BusinessAccessError) return null;
    throw err;
  });
  if (!session) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/branches" className="text-sm text-brand-700 hover:underline">
          ← Branches
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink-900">Add a branch</h1>
        <p className="mt-1 text-sm text-ink-500">
          A new branch gets its own catalogue, stock, orders and delivery zones under your business.
        </p>
      </div>
      <BranchCreateForm />
    </div>
  );
}
