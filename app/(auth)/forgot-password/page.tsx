import Link from "next/link";
import { ConfirmlyLogo } from "@/components/logo";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Reset password" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-night-900 px-4 py-12">
      <div className="pointer-events-none absolute inset-0">
        <div className="night-grid absolute inset-0" />
        <div className="absolute -left-32 bottom-0 h-[380px] w-[380px] orb animate-orb" />
      </div>
      <div className="relative mx-auto w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link href="/" aria-label="Confirmly home">
            <ConfirmlyLogo tone="dark" />
          </Link>
        </div>
        <div className="anim-fade-up rounded-3xl border border-ink-900/5 bg-surface-raised p-8 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
          <h1 className="text-xl font-bold text-ink-900">
            {token ? "Choose a new password" : "Reset your password"}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {token
              ? "Set a new password for your account."
              : "Enter your account email and we will issue a reset link."}
          </p>
          <ForgotForm token={token} />
        </div>
      </div>
    </div>
  );
}
