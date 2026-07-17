"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction, type SignupState } from "./actions";
import { Button, Input } from "@/components/ui";

const initialState: SignupState = { error: null };

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
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
      <Input
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="new-password"
        required
        minLength={8}
        placeholder="At least 8 characters"
      />
      <Input
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label="Confirm password"
        autoComplete="new-password"
        required
        placeholder="Repeat your password"
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
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account" : "Create business account"}
      </Button>
      <p className="text-center text-sm text-ink-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
