"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/products", label: "Products" },
  { href: "/dashboard/conversations", label: "Conversations" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Dashboard navigation"
      className="flex gap-1 overflow-x-auto px-4 pb-3 lg:flex-col lg:pb-0"
    >
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-brand-50 text-brand-800"
                : "text-ink-700 hover:bg-ink-900/5"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
