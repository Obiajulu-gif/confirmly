"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";
import { Button, Input } from "@/components/ui";

const initialState: LoginState = { error: null };

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      <Input
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        placeholder="you@example.com"
      />
      <div>
        <Input
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          required
          placeholder="At least 8 characters"
        />
        <div className="mt-2 text-right">
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-brand-700 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </div>
      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-ink-500">
        New to Confirmly?{" "}
        <Link href="/signup" className="font-semibold text-brand-700 hover:underline">
          Create a business account
        </Link>
      </p>
    </form>
  );
}
