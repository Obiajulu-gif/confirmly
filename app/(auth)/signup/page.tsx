import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ConfirmlyLogo } from "@/components/logo";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Create business account" };

export default async function SignupPage() {
  const session = await getSession();
  if (session) redirect(session.merchantId ? "/dashboard" : "/onboarding");

  return (
    <div className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-night-900 px-4 py-12">
      <div className="pointer-events-none absolute inset-0">
        <div className="night-grid absolute inset-0" />
        <div className="absolute -right-32 top-0 h-[380px] w-[380px] orb animate-orb" />
      </div>
      <div className="relative mx-auto w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link href="/" aria-label="Confirmly home">
            <ConfirmlyLogo tone="dark" />
          </Link>
        </div>
        <div
          className="anim-fade-up rounded-3xl border border-ink-900/5 bg-surface-raised p-8 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]"
          style={{ "--d": "0.1s" } as React.CSSProperties}
        >
          <h1 className="text-xl font-bold text-ink-900">
            Create your business account
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Register your business, add products, and start collecting verified
            payments on WhatsApp.
          </p>
          <SignupForm />
        </div>
      </div>
    </div>
  );
}
