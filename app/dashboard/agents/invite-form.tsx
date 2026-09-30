"use client";

import { useActionState } from "react";
import { Button, Input, Select } from "@/components/ui";
import { inviteAgentAction, type InviteState } from "./actions";

const initial: InviteState = { error: null, link: null };

export function InviteForm({
  branches,
  defaultBranchId,
}: {
  branches: Array<{ id: string; name: string }>;
  /** Pre-selects a branch, e.g. when arriving from a branch's page. */
  defaultBranchId?: string;
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
        <Select
          name="branchId"
          label="Assign to branch"
          required
          defaultValue={branches.some((b) => b.id === defaultBranchId) ? defaultBranchId : ""}
        >
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
        <div
          role="status"
          className={`rounded-lg px-3 py-2 text-sm ring-1 ${
            state.emailStatus === "sent"
              ? "bg-brand-50 text-brand-900 ring-brand-200"
              : "bg-amber-50 text-amber-900 ring-amber-200"
          }`}
        >
          {state.emailStatus === "sent" ? (
            <>
              <p className="font-semibold">Invitation emailed to {state.email}.</p>
              <p className="mt-1">
                If it doesn&apos;t arrive, you can share this one-time link with them directly:
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">Invitation created, but the email wasn&apos;t sent.</p>
              <p className="mt-1">
                {state.emailStatus === "not_configured"
                  ? "Email isn't set up yet. "
                  : "The email service didn't accept it. "}
                Share this one-time link with {state.email} yourself:
              </p>
            </>
          )}
          <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-xs text-ink-800">
            {state.link}
          </code>
        </div>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send invitation"}
      </Button>
    </form>
  );
}
