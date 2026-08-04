"use client";

import { useActionState } from "react";
import { Button, Input } from "@/components/ui";
import { requestWithdrawalAction, type WithdrawState } from "./actions";

const initial: WithdrawState = { error: null, ok: false };

export function WithdrawForm({ availableNaira }: { availableNaira: string }) {
  const [state, action, pending] = useActionState(requestWithdrawalAction, initial);
  return (
    <form action={action} className="space-y-3">
      <Input
        name="amountNaira"
        type="number"
        step="0.01"
        min="1"
        label={`Amount to withdraw (available ${availableNaira})`}
        required
        placeholder="0.00"
      />
      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900 ring-1 ring-brand-200">
          Withdrawal request recorded. Funds are reserved from your balance; the payout is processed
          manually (no automated transfer in this version).
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Request withdrawal"}
      </Button>
    </form>
  );
}
