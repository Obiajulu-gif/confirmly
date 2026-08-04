import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDemoMode } from "@/lib/env";
import { getDashboardScope } from "@/lib/business/scope";
import { ConfirmlyLogo } from "@/components/logo";
import { logoutAction } from "@/app/(auth)/login/actions";
import { NavLinks } from "./nav-links";
import { BranchSwitcher } from "./branch-switcher";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = await getSession();
  if (!authed) redirect("/login?next=/dashboard");
  const scope = await getDashboardScope();
  if (!scope) redirect("/onboarding");

  const business = await prisma.business.findUnique({
    where: { id: scope.session.businessId },
    select: { name: true },
  });
  const isMerchant = scope.role === "MERCHANT";
  const agentBranch = scope.branches.find((b) => b.id === scope.activeBranchId);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="relative border-b border-white/5 bg-gradient-to-b from-night-800 via-night-900 to-night-900 text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="night-grid pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative flex items-center justify-between p-4 lg:block lg:p-5">
          <Link href="/dashboard" aria-label="Dashboard home">
            <ConfirmlyLogo tone="dark" />
          </Link>
          <div className="min-w-0 flex-1 lg:block">
            <p className="mt-0 flex items-center gap-1.5 text-xs text-white/50 lg:mt-3">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
              {business?.name ?? "Business"}
            </p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-white/35">
              {isMerchant ? "Merchant" : "Branch Agent"}
            </p>
            {isMerchant ? (
              <BranchSwitcher
                branches={scope.branches}
                activeBranchId={scope.activeBranchId}
              />
            ) : agentBranch ? (
              <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/80">
                {agentBranch.name}
              </p>
            ) : null}
          </div>
        </div>
        <NavLinks role={scope.role} />
        <div className="relative mt-auto hidden p-4 lg:block">
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full truncate rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-sm font-medium text-white/70 transition hover:border-white/25 hover:text-white"
            >
              Sign out
              <span className="block truncate text-[11px] font-normal text-white/40">
                {scope.session.email}
              </span>
            </button>
          </form>
        </div>
      </aside>

      <div className="flex-1 bg-surface">
        {isDemoMode() ? (
          <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">
            DEMO MODE — external integrations are simulated with fixtures. No
            real messages are sent and no real payments occur.
          </div>
        ) : null}
        <main
          className="anim-fade-up mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8"
          style={{ "--d": "0.05s" } as React.CSSProperties}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
