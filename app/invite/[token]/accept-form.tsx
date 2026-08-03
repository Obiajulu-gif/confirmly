"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { acceptInviteAction, type AcceptState } from "./actions";

const initial: AcceptState = { error: null };

export function AcceptForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction, initial);
  return (
    <form action={action} className="mt-6 space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full py-2.5">
        {pending ? "Accepting…" : "Accept and open my branch"}
      </Button>
    </form>
  );
}
