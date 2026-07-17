"use client";

import { useActionState, useState } from "react";
import { Landmark, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button, Input } from "@/components/ui";
import {
  confirmAccountAction,
  createBusinessAction,
  validateAccountAction,
  type WizardState,
} from "./actions";

const EMPTY: WizardState = { error: null, resolvedAccountName: null, notice: null };

export function BusinessForm() {
  const [state, formAction, pending] = useActionState(createBusinessAction, EMPTY);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input id="name" name="name" label="Business name" required placeholder="Ada Styles" />
        <Input id="category" name="category" label="Category" placeholder="Fashion" />
      </div>
      <Input
        id="description"
        name="description"
        label="Short description"
        placeholder="What do you sell?"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          id="supportEmail"
          name="supportEmail"
          type="email"
          label="Support email"
          placeholder="hello@yourbusiness.com"
        />
        <Input
          id="phoneNumber"
          name="phoneNumber"
          label="Business phone"
          placeholder="+234 803 123 4567"
        />
      </div>
      <Input id="address" name="address" label="Address" placeholder="12 Allen Avenue" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input id="stateRegion" name="stateRegion" label="State" placeholder="Lagos" />
        <Input id="country" name="country" label="Country" defaultValue="Nigeria" />
      </div>
      <p className="text-xs text-ink-500">
        Currency is NGN. Your store link and WhatsApp store code are generated
        from the business name.
      </p>
      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Registering business" : "Register business"}
      </Button>
    </form>
  );
}

export function SettlementForm({
  banks,
}: {
  banks: Array<{ name: string; code: string }>;
}) {
  const [validateState, validateFormAction, validating] = useActionState(
    validateAccountAction,
    EMPTY
  );
  const [confirmState, confirmFormAction, confirming] = useActionState(
    confirmAccountAction,
    EMPTY
  );
  const [bank, setBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  const resolved = validateState.resolvedAccountName;
  const notice = validateState.notice;
  const state = confirmState.error ? confirmState : validateState;

  return (
    <div className="space-y-4">
      <form action={validateFormAction} className="space-y-4" noValidate>
        <label className="block text-sm" htmlFor="bank">
          <span className="mb-1.5 block font-medium text-ink-700">Bank</span>
          <select
            id="bank"
            name="bank"
            required
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            className="w-full rounded-lg border border-ink-900/10 bg-surface-raised px-3 py-2 text-ink-900 focus:border-brand-500"
          >
            <option value="">Choose your bank</option>
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
          label="Account number"
          required
          inputMode="numeric"
          maxLength={12}
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          placeholder="10-digit NUBAN"
        />
        {!resolved && !notice ? (
          <Button type="submit" disabled={validating} className="w-full">
            {validating ? "Validating with Monnify" : "Validate account"}
          </Button>
        ) : null}
      </form>

      {(resolved || notice) && (
        <form action={confirmFormAction} className="space-y-4">
          <input type="hidden" name="bank" value={bank} />
          <input type="hidden" name="accountNumber" value={accountNumber} />
          {resolved ? (
            <>
              <input type="hidden" name="resolvedAccountName" value={resolved} />
              <div className="flex items-start gap-3 rounded-xl bg-brand-50 p-4 ring-1 ring-brand-200">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
                <div className="text-sm">
                  <p className="font-semibold text-brand-800">
                    Account resolved by Monnify
                  </p>
                  <p className="mt-0.5 text-lg font-bold text-ink-900">{resolved}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    Settlements for verified payments will be routed to this
                    account. Confirm only if this name is correct.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
              <div className="text-sm text-amber-900">
                <p className="font-semibold">Validation unavailable</p>
                <p className="mt-1">{notice}</p>
              </div>
            </div>
          )}
          {state.error ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" disabled={confirming} className="w-full">
            {confirming
              ? "Saving settlement account"
              : resolved
                ? "Confirm and create subaccount"
                : "Save account for later validation"}
          </Button>
        </form>
      )}

      <p className="flex items-center gap-2 text-xs text-ink-500">
        <Landmark className="h-3.5 w-3.5" aria-hidden />
        Your account number is encrypted at rest and only ever displayed
        masked. Customers never see this account — they pay a Monnify-generated
        checkout account.
      </p>
    </div>
  );
}
