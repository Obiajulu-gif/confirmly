import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { logoutAction } from "@/app/(auth)/login/actions";
import { AdminNav } from "./admin-nav";

export const metadata = { title: "Admin · Confirmly" };

/**
 * Platform admin console. Cross-tenant, so the gate is strict: only an email on
 * the ADMIN_EMAILS allowlist may enter (middleware blocks it too, defence in
 * depth). This layout is the authoritative check.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="relative border-b border-white/5 bg-gradient-to-b from-night-900 via-night-900 to-black text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="relative flex items-center justify-between p-4 lg:block lg:p-5">
          <Link href="/admin" aria-label="Admin home" className="flex items-center gap-2">
            <span className="rounded-lg bg-brand-500 px-2 py-1 text-sm font-bold text-black">
              CF
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Platform Admin
            </span>
          </Link>
          <p className="mt-0 flex items-center gap-1.5 text-xs text-white/50 lg:mt-3">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Cross-tenant view
          </p>
        </div>
        <AdminNav />
        <div className="relative mt-auto hidden p-4 lg:block">
          <Link
            href="/dashboard"
            className="mb-2 block w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-sm font-medium text-white/70 transition hover:border-white/25 hover:text-white"
          >
            ← Back to my dashboard
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full truncate rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-sm font-medium text-white/70 transition hover:border-white/25 hover:text-white"
            >
              Sign out
              <span className="block truncate text-[11px] font-normal text-white/40">
                {session.email}
              </span>
            </button>
          </form>
        </div>
      </aside>

      <div className="flex-1 bg-surface">
        <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-xs font-semibold text-amber-900">
          PLATFORM ADMIN — actions here affect every merchant. Every change is
          recorded in the audit log.
        </div>
        <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
