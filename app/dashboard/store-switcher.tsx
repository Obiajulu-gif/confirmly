"use client";

import { useRef } from "react";
import { switchStoreAction } from "./stores/actions";

export function StoreSwitcher({
  currentMerchantId,
  stores,
}: {
  currentMerchantId: string;
  stores: Array<{ id: string; name: string }>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={switchStoreAction} className="mt-3">
      <label
        htmlFor="dashboard-store"
        className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-white/40"
      >
        Current store
      </label>
      <select
        id="dashboard-store"
        name="merchantId"
        defaultValue={currentMerchantId}
        onChange={() => formRef.current?.requestSubmit()}
        className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white outline-none"
      >
        {stores.map((store) => (
          <option key={store.id} value={store.id} className="text-ink-900">
            {store.name}
          </option>
        ))}
      </select>
    </form>
  );
}
