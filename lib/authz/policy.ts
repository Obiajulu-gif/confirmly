/**
 * Pure role→capability policy for the multi-branch model. No DB, no imports —
 * unit-testable and the single source of truth for the permission matrix in
 * the PRD. Branch-scoped capabilities (manage the assigned branch's chats,
 * orders, products) are authorized separately via branch access, not here.
 */

export type BusinessRole = "MERCHANT" | "BRANCH_AGENT";

export type Capability =
  | "manage_branches" // create / link / unlink / suspend / close
  | "view_all_branches"
  | "manage_agents" // invite / suspend / remove agents
  | "change_business_settings"
  | "change_payout"
  | "view_wallet"
  | "initiate_withdrawal"
  | "export_all_branches"
  | "takeover_any_branch";

/**
 * Every capability here is Merchant-only in v1. A Branch Agent has none of
 * them; its powers are confined to the branch it is assigned to.
 */
const MERCHANT_ONLY: ReadonlySet<Capability> = new Set<Capability>([
  "manage_branches",
  "view_all_branches",
  "manage_agents",
  "change_business_settings",
  "change_payout",
  "view_wallet",
  "initiate_withdrawal",
  "export_all_branches",
  "takeover_any_branch",
]);

/** True when a role holds a business-wide capability. */
export function can(role: BusinessRole, capability: Capability): boolean {
  if (role === "MERCHANT") return true;
  // BRANCH_AGENT: never holds a business-wide capability.
  return !MERCHANT_ONLY.has(capability);
}

/** Navigation items a role may see (used to build the sidebar). */
export function allowedNav(role: BusinessRole): string[] {
  const merchant = [
    "overview",
    "branches",
    "conversations",
    "orders",
    "products",
    "inventory",
    "payments",
    "withdrawals",
    "agents",
    "reports",
    "integrations",
    "settings",
  ];
  const agent = [
    "overview",
    "conversations",
    "orders",
    "products",
    "inventory",
    "reports",
  ];
  return role === "MERCHANT" ? merchant : agent;
}
