"use client";

import { useActionState } from "react";
import { Button, Input } from "@/components/ui";
import {
  createStoreAction,
  type StoreFormState,
} from "./actions";

const initialState: StoreFormState = { ok: false, error: null };

export function StoreCreateForm() {
  const [state, action, pending] = useActionState(
    createStoreAction,
    initialState
  );

  return (
    <form
      action={action}
      className="grid gap-4 rounded-2xl border border-ink-900/10 bg-white p-5 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <h2 className="text-lg font-bold text-ink-900">Create another store</h2>
        <p className="mt-1 text-sm text-ink-500">
          Every store gets its own catalogue, WhatsApp menu, orders and delivery
          zones. Payment setup remains store-specific.
        </p>
      </div>
      <Input
        name="name"
        label="Store name"
        required
        placeholder="ChainMove Store"
      />
      <Input
        name="category"
        label="Category"
        placeholder="Travel and vehicle accessories"
      />
      <Input
        name="supportEmail"
        type="email"
        label="Support email"
        placeholder="support@example.com"
      />
      <Input
        name="phoneNumber"
        label="Public phone"
        placeholder="+234..."
      />
      <Input
        name="stateRegion"
        label="State"
        placeholder="Lagos"
      />
      <Input
        name="address"
        label="Business address"
        placeholder="Yaba, Lagos"
      />
      <div className="sm:col-span-2">
        <label
          htmlFor="store-description"
          className="mb-1.5 block text-sm font-medium text-ink-700"
        >
          Description
        </label>
        <textarea
          id="store-description"
          name="description"
          rows={3}
          className="w-full rounded-xl border border-ink-900/10 bg-surface px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
          placeholder="What does this store sell?"
        />
      </div>
      {state.error ? (
        <p className="text-sm text-red-700 sm:col-span-2" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating store..." : "Create store and manage products"}
        </Button>
      </div>
    </form>
  );
}
