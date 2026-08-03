"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { signupAction, type SignupState } from "./actions";
import { Button, Input } from "@/components/ui";
import { PasswordField } from "@/components/password-field";

const initialState: SignupState = { error: null };

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-4" noValidate>
      <Input
        id="name"
        name="name"
        type="text"
        label="Full name"
        autoComplete="name"
        required
        placeholder="Adaeze Obi"
      />
      <Input
        id="email"
        name="email"
        type="email"
        label="Work email"
        autoComplete="email"
        required
        placeholder="you@yourbusiness.com"
      />
      <PasswordField
        name="password"
        label="Password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        minLength={8}
        showStrength
      />
      <PasswordField
        name="confirmPassword"
        label="Confirm password"
        autoComplete="new-password"
        placeholder="Repeat your password"
        minLength={8}
      />
      <label className="flex items-start gap-2.5 text-sm text-ink-700">
        <input
          type="checkbox"
          name="terms"
          required
          className="mt-0.5 h-4 w-4 rounded border-ink-900/20 accent-brand-600"
        />
        <span>
          I accept the{" "}
          <Link href="/#security" className="font-semibold text-brand-700 underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/#security" className="font-semibold text-brand-700 underline">
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      {state.error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100"
        >
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full py-2.5">
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Creating account…
          </>
        ) : (
          "Create business account"
        )}
      </Button>
    </form>
  );
}
