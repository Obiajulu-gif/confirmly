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
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-8 flex justify-center">
        <Link href="/" aria-label="Confirmly home">
          <ConfirmlyLogo />
        </Link>
      </div>
      <div className="rounded-card border border-ink-900/5 bg-surface-raised p-8 shadow-sm">
        <h1 className="text-xl font-bold text-ink-900">Merchant login</h1>
        <p className="mt-1 text-sm text-ink-500">
          Sign in to manage orders, products and conversations.
        </p>
        <LoginForm next={next} />
      </div>
      <p className="mt-6 text-center text-xs text-ink-500">
        Demo credentials are provisioned via environment variables — see the
        README.
      </p>
    </div>
  );
}
