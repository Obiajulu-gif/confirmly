"use client";

import { useRef } from "react";
import { setActiveBranchAction } from "./branch-actions";
import type { ScopeBranch } from "@/lib/business/scope";

/** Merchant-only branch selector, including an "All Branches" aggregate. */
export function BranchSwitcher({
  branches,
  activeBranchId,
}: {
  branches: ScopeBranch[];
  activeBranchId: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={setActiveBranchAction} className="mt-3">
      <label htmlFor="branch-switch" className="sr-only">
        Active branch
      </label>
      <select
        id="branch-switch"
        name="branchId"
        defaultValue={activeBranchId ?? "all"}
        onChange={() => formRef.current?.requestSubmit()}
        className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/80 focus:border-brand-400 focus:outline-none"
      >
        <option value="all">All Branches</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
            {b.status !== "ACTIVE" ? ` (${b.status.toLowerCase()})` : ""}
          </option>
        ))}
      </select>
    </form>
  );
}
