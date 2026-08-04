import { describe, expect, it } from "vitest";
import { allowedNav, can, type Capability } from "@/lib/authz/policy";

const MERCHANT_ONLY: Capability[] = [
  "manage_branches",
  "view_all_branches",
  "manage_agents",
  "change_business_settings",
  "change_payout",
  "view_wallet",
  "initiate_withdrawal",
  "export_all_branches",
  "takeover_any_branch",
];

describe("role capability policy", () => {
  it("grants every business-wide capability to a Merchant", () => {
    for (const cap of MERCHANT_ONLY) {
      expect(can("MERCHANT", cap)).toBe(true);
    }
  });

  it("denies every business-wide capability to a Branch Agent", () => {
    for (const cap of MERCHANT_ONLY) {
      expect(can("BRANCH_AGENT", cap)).toBe(false);
    }
  });

  it("Branch Agent navigation hides restricted sections", () => {
    const agent = allowedNav("BRANCH_AGENT");
    for (const hidden of ["branches", "payments", "withdrawals", "agents", "integrations", "settings"]) {
      expect(agent).not.toContain(hidden);
    }
    // But keeps the operational sections.
    for (const shown of ["overview", "conversations", "orders", "products", "inventory", "reports"]) {
      expect(agent).toContain(shown);
    }
  });

  it("Merchant navigation includes the privileged sections", () => {
    const merchant = allowedNav("MERCHANT");
    for (const shown of ["branches", "withdrawals", "agents", "settings"]) {
      expect(merchant).toContain(shown);
    }
  });
});
