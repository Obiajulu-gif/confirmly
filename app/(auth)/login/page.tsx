import Link from "next/link";
import { AuthShell } from "../auth-shell";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage orders, products and conversations."
      footer={
        <p className="text-center text-sm text-ink-500">
          New to Confirmly?{" "}
          <Link
            href="/signup"
            className="font-semibold text-brand-700 hover:underline"
          >
            Create a business account
          </Link>
        </p>
      }
    >
      <LoginForm next={next} />
    </AuthShell>
  );
}
