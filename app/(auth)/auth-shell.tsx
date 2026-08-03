import Link from "next/link";
import { ShieldCheck, Zap, BadgeCheck } from "lucide-react";
import { ConfirmlyLogo } from "@/components/logo";

/**
 * Two-column authentication shell: a branded value panel on the left (hidden on
 * small screens) and the form card on the right. Shared by login, signup and
 * forgot-password so the entry experience is consistent.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-surface">
      {/* Brand / value panel */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-night-900 p-10 text-white lg:flex xl:p-14">
        <div className="pointer-events-none absolute inset-0">
          <div className="night-grid absolute inset-0 opacity-60" />
          <div className="absolute -left-24 top-10 h-[360px] w-[360px] orb animate-orb" />
        </div>
        <div className="relative">
          <Link href="/" aria-label="Confirmly home">
            <ConfirmlyLogo tone="dark" />
          </Link>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            Every naira confirmed by Monnify — never a screenshot.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            Take WhatsApp orders that are priced from your real catalogue,
            verified server-side, and settled straight to your own bank account.
          </p>
          <ul className="mt-8 space-y-4 text-sm">
            <ValueRow
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Fraud-proof payments"
              body="Only a verified Monnify response can mark an order paid."
            />
            <ValueRow
              icon={<Zap className="h-5 w-5" />}
              title="No app to install"
              body="Customers order in the WhatsApp thread they already use."
            />
            <ValueRow
              icon={<BadgeCheck className="h-5 w-5" />}
              title="Settled to your bank"
              body="Split to your own Monnify subaccount — no platform float."
            />
          </ul>
        </div>
        <p className="relative text-xs text-white/30">
          © {new Date().getFullYear()} Confirmly · From chat to confirmed payment.
        </p>
      </aside>

      {/* Form column */}
      <div className="flex w-full flex-col justify-center px-4 py-10 sm:px-8 lg:w-1/2">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Link href="/" aria-label="Confirmly home">
              <ConfirmlyLogo />
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">
            {title}
          </h1>
          <p className="mt-1.5 text-sm text-ink-500">{subtitle}</p>
          {children}
          {footer ? <div className="mt-6">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

function ValueRow({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
        {icon}
      </span>
      <span>
        <span className="block font-semibold text-white/90">{title}</span>
        <span className="block text-white/50">{body}</span>
      </span>
    </li>
  );
}
