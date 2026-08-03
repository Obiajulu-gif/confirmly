import Link from "next/link";
import { AuthShell } from "../auth-shell";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Reset password" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthShell
      title={token ? "Choose a new password" : "Reset your password"}
      subtitle={
        token
          ? "Set a new password for your account."
          : "Enter your account email and we will issue a reset link."
      }
      footer={
        <p className="text-center text-sm text-ink-500">
          Remembered it?{" "}
          <Link
            href="/login"
            className="font-semibold text-brand-700 hover:underline"
          >
            Back to login
          </Link>
        </p>
      }
    >
      <ForgotForm token={token} />
    </AuthShell>
  );
}
