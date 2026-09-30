"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  LayoutDashboard,
  Store,
  Package,
  Users,
  UserPlus,
  Smartphone,
  Receipt,
} from "lucide-react";
import { NavDrawer } from "@/components/nav-drawer";

const links = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/merchants", label: "Merchants", icon: Store },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/leads", label: "Leads", icon: UserPlus },
  { href: "/admin/sessions", label: "WhatsApp numbers", icon: Smartphone },
  { href: "/admin/orders", label: "Orders", icon: Receipt },
];

export function AdminNav({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin navigation" className="relative flex flex-col gap-1 px-3">
      {links.map((link) => {
        const Icon = link.icon;
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
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

/**
 * Phone navigation for the admin console: a menu button (placed in the mobile
 * top bar) that opens a drawer with every admin page plus the account actions.
 */
export function AdminMobileNav({ header, footer }: { header: ReactNode; footer: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open admin menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/80 transition hover:text-white"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      <NavDrawer open={open} onClose={close} label="Admin menu">
        <div className="border-b border-white/10 p-5 pr-14">{header}</div>
        <div className="py-3">
          <AdminNav onNavigate={close} />
        </div>
        <div className="mt-auto space-y-2 border-t border-white/10 p-4">{footer}</div>
      </NavDrawer>
    </>
  );
}
