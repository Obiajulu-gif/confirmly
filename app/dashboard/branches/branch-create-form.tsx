"use client";

import { useActionState } from "react";
import { Button, Input } from "@/components/ui";
import { createBranchAction, type BranchFormState } from "./actions";

const initial: BranchFormState = { ok: false, error: null };

export function BranchCreateForm() {
  const [state, action, pending] = useActionState(createBranchAction, initial);
  return (
    <form
      action={action}
      className="grid gap-4 rounded-2xl border border-ink-900/10 bg-white p-5 sm:grid-cols-2"
    >
      <Input name="name" label="Branch name" required placeholder="Jide Lekki" />
      <Input name="category" label="Category" placeholder="Restaurant" />
      <Input name="supportEmail" type="email" label="Support email" placeholder="support@example.com" />
      <Input name="phoneNumber" label="Public phone" placeholder="+234..." />
      <Input name="stateRegion" label="State" placeholder="Lagos" />
      <Input name="address" label="Address" placeholder="Lekki Phase 1, Lagos" />
      <div className="sm:col-span-2">
        <label htmlFor="branch-description" className="mb-1.5 block text-sm font-medium text-ink-700">
          Description
        </label>
        <textarea
          id="branch-description"
          name="description"
          rows={3}
          className="w-full rounded-xl border border-ink-900/10 bg-surface px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
          placeholder="What does this branch sell?"
        />
      </div>
      {state.error ? (
        <p className="text-sm text-red-700 sm:col-span-2" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating branch..." : "Create branch"}
        </Button>
      </div>
    </form>
  );
}
