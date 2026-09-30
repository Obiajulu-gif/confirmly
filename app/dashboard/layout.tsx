import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDemoMode } from "@/lib/env";
import { getDashboardScope } from "@/lib/business/scope";
import { ConfirmlyLogo } from "@/components/logo";
import { logoutAction } from "@/app/(auth)/login/actions";
import { NavLinks } from "./nav-links";
import { MobileNav } from "./mobile-nav";
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
  const activeBranch = scope.branches.find((b) => b.id === scope.activeBranchId);
  const businessName = business?.name ?? "Business";

  /** Business identity + branch control; rendered in the desktop sidebar and the mobile drawer. */
  const identity = (switcherId: string) => (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs text-white/50">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
        <span className="truncate">{businessName}</span>
      </p>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-white/35">
        {isMerchant ? "Merchant" : "Branch Agent"}
      </p>
      {isMerchant ? (
        <BranchSwitcher
          id={switcherId}
          branches={scope.branches}
          activeBranchId={scope.activeBranchId}
        />
      ) : activeBranch ? (
        <p className="mt-3 truncate rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/80">
          {activeBranch.name}
        </p>
      ) : null}
    </div>
  );

  const signOut = (
    <form action={logoutAction}>
      <button
        type="submit"
        className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-sm font-medium text-white/70 transition hover:border-white/25 hover:text-white"
      >
        <LogOut className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
        <span className="min-w-0">
          Sign out
          <span className="block truncate text-[11px] font-normal text-white/40">
            {scope.session.email}
          </span>
        </span>
      </button>
    </form>
  );

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* ------------------------------------------ desktop sidebar (lg+) */}
      <aside className="relative hidden border-r border-white/5 bg-gradient-to-b from-night-800 via-night-900 to-night-900 text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col">
        <div className="night-grid pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative p-5">
          <Link href="/dashboard" aria-label="Dashboard home">
            <ConfirmlyLogo tone="dark" />
          </Link>
          <div className="mt-3">{identity("branch-switch")}</div>
        </div>
        <div className="relative min-h-0 flex-1 overflow-y-auto pb-2">
          <NavLinks role={scope.role} />
        </div>
        <div className="relative p-4">{signOut}</div>
      </aside>

      {/* ------------------------------------------ mobile top bar (< lg) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/5 bg-night-900/95 px-4 py-3 text-white backdrop-blur-md lg:hidden">
        <Link href="/dashboard" aria-label="Dashboard home" className="shrink-0">
          <ConfirmlyLogo tone="dark" />
        </Link>
        <p className="min-w-0 truncate rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-white/70">
          {isMerchant && !activeBranch ? "All branches" : (activeBranch?.name ?? businessName)}
        </p>
      </header>

      <div className="min-w-0 flex-1 bg-surface">
        {isDemoMode() ? (
          <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">
            DEMO MODE — external integrations are simulated with fixtures. No
            real messages are sent and no real payments occur.
          </div>
        ) : null}
        <main
          className="app-shell anim-fade-up mx-auto w-full max-w-6xl p-4 pb-28 sm:p-6 sm:pb-28 lg:p-8"
          style={{ "--d": "0.05s" } as React.CSSProperties}
        >
          {children}
        </main>
      </div>

      <MobileNav role={scope.role} header={identity("branch-switch-mobile")} footer={signOut} />
    </div>
  );
}
