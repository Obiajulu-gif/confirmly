"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Store,
  Package,
  Users,
  Smartphone,
  Receipt,
} from "lucide-react";

const links = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/merchants", label: "Merchants", icon: Store },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/sessions", label: "WhatsApp numbers", icon: Smartphone },
  { href: "/admin/orders", label: "Orders", icon: Receipt },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Admin navigation"
      className="relative flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3 lg:pb-0"
    >
      {links.map((link) => {
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
