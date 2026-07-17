"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  requestResetAction,
  resetPasswordAction,
  type ForgotState,
} from "./actions";
import { Button, Input } from "@/components/ui";

const initialState: ForgotState = { message: null, error: null, done: false };

export function ForgotForm({ token }: { token?: string }) {
  const action = token ? resetPasswordAction : requestResetAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  if (state.done) {
    return (
      <div className="mt-6 space-y-4">
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800 ring-1 ring-brand-200">
          {state.message}
        </p>
        <Link
          href="/login"
          className="block w-full rounded-lg bg-brand-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand-700"
        >
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      {token ? (
        <>
          <input type="hidden" name="token" value={token} />
          <Input
            id="password"
            name="password"
            type="password"
            label="New password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="At least 8 characters"
          />
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            label="Confirm new password"
            autoComplete="new-password"
            required
            placeholder="Repeat your new password"
          />
        </>
      ) : (
        <Input
          id="email"
          name="email"
          type="email"
          label="Account email"
          autoComplete="email"
          required
          placeholder="you@yourbusiness.com"
        />
      )}
      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800 ring-1 ring-brand-200">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending
          ? "Working"
          : token
            ? "Set new password"
            : "Send reset link"}
      </Button>
      <p className="text-center text-sm text-ink-500">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Back to login
        </Link>
      </p>
    </form>
  );
}
