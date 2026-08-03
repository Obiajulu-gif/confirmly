import Link from "next/link";
import { getSession } from "@/lib/auth";
import { lookupInvitation } from "@/lib/business/agents";
import { AuthShell } from "@/app/(auth)/auth-shell";
import { AcceptForm } from "./accept-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Branch Agent invitation" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await lookupInvitation(token);
  const session = await getSession();

  if (!invitation) {
    return (
      <AuthShell
        title="Invitation not valid"
        subtitle="This invitation is invalid, expired, or has already been used."
        footer={
          <p className="text-center text-sm text-ink-500">
            <Link href="/login" className="font-semibold text-brand-700 hover:underline">
              Go to login
            </Link>
          </p>
        }
      >
        <p className="mt-6 text-sm text-ink-600">
          Ask the Merchant who invited you to send a fresh invitation link.
        </p>
      </AuthShell>
    );
  }

  const emailMismatch =
    session && session.email.toLowerCase() !== invitation.email.toLowerCase();

  return (
    <AuthShell
      title={`Join ${invitation.businessName}`}
      subtitle={`You've been invited as a Branch Agent for ${invitation.branchName}.`}
    >
      <div className="mt-6 rounded-lg border border-ink-900/10 bg-surface-raised p-4 text-sm">
        <p className="text-ink-600">
          Invitation for <span className="font-semibold text-ink-900">{invitation.email}</span>
        </p>
        <p className="mt-1 text-ink-600">
          Branch: <span className="font-semibold text-ink-900">{invitation.branchName}</span>
        </p>
      </div>

      {!session ? (
        <div className="mt-6 space-y-2 text-sm">
          <p className="text-ink-600">Log in or create an account with this email to accept.</p>
          <div className="flex gap-3">
            <Link
              href={`/login?next=/invite/${encodeURIComponent(token)}`}
              className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg border border-ink-900/15 px-4 py-2 font-semibold text-ink-700 hover:bg-ink-900/5"
            >
              Create account
            </Link>
          </div>
        </div>
      ) : emailMismatch ? (
        <p className="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          You&apos;re signed in as {session.email}, but this invite is for {invitation.email}. Sign
          out and sign in with the invited email to accept.
        </p>
      ) : (
        <AcceptForm token={token} />
      )}
    </AuthShell>
  );
}
