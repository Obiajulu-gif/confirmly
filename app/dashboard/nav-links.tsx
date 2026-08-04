"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Banknote,
  Boxes,
  CreditCard,
  LayoutDashboard,
  MessagesSquare,
  Package,
  Receipt,
  Settings,
  Store,
  UserCog,
  Wallet,
} from "lucide-react";
import type { BusinessRole } from "@/lib/authz/policy";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  merchantOnly?: boolean;
};

const links: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/branches", label: "Branches", icon: Store, merchantOnly: true },
  { href: "/dashboard/conversations", label: "Conversations", icon: MessagesSquare },
  { href: "/dashboard/orders", label: "Orders", icon: Receipt },
  { href: "/dashboard/products", label: "Products", icon: Package },
  { href: "/dashboard/inventory", label: "Inventory", icon: Boxes },
  { href: "/dashboard/payments", label: "Payments", icon: CreditCard, merchantOnly: true },
  { href: "/dashboard/withdrawals", label: "Withdrawals", icon: Wallet, merchantOnly: true },
  { href: "/dashboard/agents", label: "Agents", icon: UserCog, merchantOnly: true },
  { href: "/dashboard/reports", label: "Reports", icon: Banknote },
  { href: "/dashboard/health", label: "Integrations", icon: Activity, merchantOnly: true },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, merchantOnly: true },
];

export function NavLinks({ role }: { role: BusinessRole }) {
  const pathname = usePathname();
  const visible = links.filter((l) => role === "MERCHANT" || !l.merchantOnly);
  return (
    <nav
      aria-label="Dashboard navigation"
      className="relative flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3 lg:pb-0"
    >
      {visible.map((link) => {
        const Icon = link.icon;
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
              active
                ? "bg-brand-500/15 text-brand-300 shadow-[inset_2px_0_0_0_#34d399]"
                : "text-white/60 hover:bg-white/[0.05] hover:text-white"
            }`}
          >
            <Icon
              aria-hidden="true"
              className={`h-4 w-4 transition ${active ? "opacity-100" : "opacity-50 group-hover:opacity-90"}`}
            />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
