import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthShell } from "../auth-shell";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Create account" };

export default async function SignupPage() {
  const session = await getSession();
  if (session) redirect(session.merchantId ? "/dashboard" : "/onboarding");

  return (
    <AuthShell
      title="Create your business account"
      subtitle="Register your business, add products, and start collecting verified WhatsApp payments."
      footer={
        <p className="text-center text-sm text-ink-500">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-brand-700 hover:underline"
          >
            Log in
          </Link>
        </p>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
