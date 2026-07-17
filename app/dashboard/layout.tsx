import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDemoMode } from "@/lib/env";
import { ConfirmlyLogo } from "@/components/logo";
import { logoutAction } from "@/app/(auth)/login/actions";
import { NavLinks } from "./nav-links";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/dashboard");
  const merchant = await prisma.merchant.findUnique({
    where: { id: session.merchantId },
  });

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="border-b border-ink-900/5 bg-surface-raised lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between p-4 lg:block">
          <Link href="/dashboard" aria-label="Dashboard home">
            <ConfirmlyLogo />
          </Link>
          <p className="mt-0 text-xs text-ink-500 lg:mt-2">
            {merchant?.name ?? "Merchant"}
          </p>
        </div>
        <NavLinks />
        <div className="hidden p-4 lg:block">
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full rounded-lg border border-ink-900/10 px-3 py-2 text-left text-sm font-medium text-ink-700 hover:bg-ink-900/5"
            >
              Sign out ({session.email})
            </button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1">
        {isDemoMode() ? (
          <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">
            DEMO MODE — external integrations are simulated with fixtures. No
            real messages are sent and no real payments occur.
          </div>
        ) : null}
        <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
