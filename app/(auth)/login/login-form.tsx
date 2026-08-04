"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { loginAction, type LoginState } from "./actions";
import { Button, Input } from "@/components/ui";
import { PasswordField } from "@/components/password-field";

const initialState: LoginState = { error: null };

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      <Input
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        defaultValue={state.email ?? ""}
      />
      <div>
        <PasswordField
          name="password"
          label="Password"
          autoComplete="current-password"
          placeholder="Your password"
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
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  );
}
