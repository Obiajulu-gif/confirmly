"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  Boxes,
  CreditCard,
  LayoutDashboard,
  MessagesSquare,
  Package,
  QrCode,
  Receipt,
  Settings,
  Store,
  UserCog,
  Wallet,
} from "lucide-react";
import type { BusinessRole } from "@/lib/authz/policy";

export type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  merchantOnly?: boolean;
  /**
   * Pinned to the mobile bottom tab bar (with this shorter label). Tab pages
   * are left out of the mobile "More" sidebar so no page is listed twice.
   */
  tab?: string;
};

/** Single source for every dashboard nav surface (sidebar, tabs, drawer). */
export const dashboardLinks: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true, tab: "Overview" },
  { href: "/dashboard/orders", label: "Orders", icon: Receipt, tab: "Orders" },
  { href: "/dashboard/conversations", label: "Conversations", icon: MessagesSquare, tab: "Chats" },
  { href: "/dashboard/products", label: "Products", icon: Package, tab: "Products" },
  { href: "/dashboard/storefront", label: "WhatsApp store", icon: QrCode },
  { href: "/dashboard/branches", label: "Branches", icon: Store, merchantOnly: true },
  { href: "/dashboard/inventory", label: "Inventory", icon: Boxes },
  { href: "/dashboard/payments", label: "Payments", icon: CreditCard, merchantOnly: true },
  { href: "/dashboard/withdrawals", label: "Withdrawals", icon: Wallet, merchantOnly: true },
  { href: "/dashboard/agents", label: "Agents", icon: UserCog, merchantOnly: true },
  { href: "/dashboard/reports", label: "Reports", icon: Banknote },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, merchantOnly: true },
];

export function visibleLinks(role: BusinessRole): NavItem[] {
  return dashboardLinks.filter((l) => role === "MERCHANT" || !l.merchantOnly);
}

export function isActive(link: Pick<NavItem, "href" | "exact">, pathname: string): boolean {
  return link.exact ? pathname === link.href : pathname.startsWith(link.href);
}

/**
 * Vertical link list. `variant="sidebar"` is the full desktop list;
 * `variant="drawer"` is the mobile "More" list, which skips tab-bar pages.
 */
export function NavLinks({
  role,
  variant = "sidebar",
  onNavigate,
}: {
  role: BusinessRole;
  variant?: "sidebar" | "drawer";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = visibleLinks(role).filter((l) => variant === "sidebar" || !l.tab);
  return (
    <nav
      aria-label={variant === "sidebar" ? "Dashboard navigation" : "More pages"}
      className="relative flex flex-col gap-1 px-3"
    >
      {items.map((link) => {
        const Icon = link.icon;
        const active = isActive(link, pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
              active
                ? "bg-brand-500/15 text-brand-300 shadow-[inset_2px_0_0_0_#34d399]"
                : "text-white/60 hover:bg-white/[0.05] hover:text-white"
            }`}
          >
            <Icon
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 transition ${active ? "opacity-100" : "opacity-50 group-hover:opacity-90"}`}
            />
            <span className="truncate">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
