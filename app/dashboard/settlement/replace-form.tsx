"use client";

import { useActionState, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { replaceAccountAction, type ReplaceState } from "./actions";

const EMPTY: ReplaceState = {
  error: null,
  resolvedAccountName: null,
  notice: null,
  done: false,
};

export function ReplaceAccountForm({
  banks,
}: {
  banks: Array<{ name: string; code: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(replaceAccountAction, EMPTY);

  if (state.done) {
    return (
      <div className="rounded-xl bg-brand-50 p-4 text-sm text-brand-800 ring-1 ring-brand-200">
        <p className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Settlement account replaced
          {state.resolvedAccountName ? ` — ${state.resolvedAccountName}` : ""}.
        </p>
        {state.notice ? <p className="mt-1">{state.notice}</p> : null}
      </div>
    );
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Replace settlement account
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-ink-900/10 bg-surface p-4">
      <p className="text-sm text-ink-500">
        Replacing the account re-runs Monnify validation, recreates the
        subaccount, and keeps the old profile in history. Your password is
        required to authorise it.
      </p>
      <label className="block text-sm" htmlFor="bank">
        <span className="mb-1.5 block font-medium text-ink-700">New bank</span>
        <select
          id="bank"
          name="bank"
          required
          defaultValue=""
          className="w-full rounded-lg border border-ink-900/10 bg-surface-raised px-3 py-2 text-ink-900 focus:border-brand-500"
        >
          <option value="" disabled>
            Choose your bank
          </option>
          {banks.map((b) => (
            <option key={b.code} value={`${b.code}|${b.name}`}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <Input
        id="accountNumber"
        name="accountNumber"
        label="New account number"
        required
        inputMode="numeric"
        maxLength={12}
        placeholder="10-digit NUBAN"
      />
      <Input
        id="password"
        name="password"
        type="password"
        label="Your password"
        autoComplete="current-password"
        required
        placeholder="Confirm it's you"
      />
      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Replacing" : "Validate and replace"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
