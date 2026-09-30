"use client";

import { useRef } from "react";
import { setActiveBranchAction } from "./branch-actions";
import type { ScopeBranch } from "@/lib/business/scope";

/** Merchant-only branch selector, including an "All Branches" aggregate. */
export function BranchSwitcher({
  branches,
  activeBranchId,
  id = "branch-switch",
}: {
  branches: ScopeBranch[];
  activeBranchId: string | null;
  /** Unique per instance — the desktop sidebar and mobile drawer both render one. */
  id?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={setActiveBranchAction} className="mt-3">
      <label htmlFor={id} className="sr-only">
        Active branch
      </label>
      <select
        id={id}
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
