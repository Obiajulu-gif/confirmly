import Link from "next/link";
import { ConfirmlyLogo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Merchant login" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-night-900 px-4 py-12">
      <div className="pointer-events-none absolute inset-0">
        <div className="night-grid absolute inset-0" />
        <div className="absolute -left-32 top-0 h-[380px] w-[380px] orb animate-orb" />
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
          <h1 className="text-xl font-bold text-ink-900">Merchant login</h1>
          <p className="mt-1 text-sm text-ink-500">
            Sign in to manage orders, products and conversations.
          </p>
          <LoginForm next={next} />
        </div>
        <p className="mt-6 text-center text-xs text-white/40">
          Demo credentials are provisioned via environment variables — see the
          README.
        </p>
      </div>
    </div>
  );
}
