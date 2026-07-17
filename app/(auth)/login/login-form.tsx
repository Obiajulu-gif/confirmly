"use client";

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
      <Input
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        required
        placeholder="••••••••"
      />
      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
