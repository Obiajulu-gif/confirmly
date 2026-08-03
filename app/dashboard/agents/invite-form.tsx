"use client";

import { useActionState } from "react";
import { Button, Input, Select } from "@/components/ui";
import { inviteAgentAction, type InviteState } from "./actions";

const initial: InviteState = { error: null, link: null };

export function InviteForm({
  branches,
}: {
  branches: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(inviteAgentAction, initial);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          name="email"
          type="email"
          label="Agent email"
          required
          placeholder="agent@example.com"
        />
        <Select name="branchId" label="Assign to branch" required>
          <option value="">Choose a branch…</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </div>
      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.link ? (
        <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900 ring-1 ring-brand-200">
          <p className="font-semibold">Invitation created.</p>
          <p className="mt-1">Share this one-time link with the agent (no email is sent):</p>
          <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-xs text-ink-800">
            {state.link}
          </code>
        </div>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create invitation"}
      </Button>
    </form>
  );
}
