"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import type { BusinessRole } from "@/lib/authz/policy";
import { NavDrawer } from "@/components/nav-drawer";
import { NavLinks, isActive, visibleLinks } from "./nav-links";

/**
 * Phone navigation: a bottom tab bar for the pages merchants live in, and a
 * "More" tab that opens a sidebar with every other page. Each page appears in
 * exactly one of the two. Hidden from `lg` up, where the desktop sidebar takes over.
 */
export function MobileNav({
  role,
  header,
  footer,
}: {
  role: BusinessRole;
  /** Business name, role and branch switcher, shown at the top of the sidebar. */
  header: ReactNode;
  /** Sign-out form, shown at the bottom of the sidebar. */
  footer: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // Close the sidebar whenever navigation lands on a new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const links = visibleLinks(role);
  const tabs = links.filter((l) => l.tab);
  const moreActive = links.some((l) => !l.tab && isActive(l, pathname));

  const tabClass = (active: boolean) =>
    `relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 pb-1.5 pt-2 text-[11px] font-semibold transition ${
      active ? "text-brand-600" : "text-ink-500 active:text-ink-900"
    }`;

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-900/10 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgba(17,24,39,0.18)] backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto flex max-w-lg items-stretch">
          {tabs.map((link) => {
            const Icon = link.icon;
            const active = isActive(link, pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={tabClass(active)}
              >
                {active ? (
                  <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-brand-500" />
                ) : null}
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                <span className="max-w-full truncate">{link.tab}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            className={tabClass(moreActive || open)}
          >
            {moreActive ? (
              <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-brand-500" />
            ) : null}
            <Menu className="h-5 w-5 shrink-0" aria-hidden />
            <span>More</span>
          </button>
        </div>
      </nav>

      <NavDrawer open={open} onClose={close} label="More pages" side="right">
        <div className="relative border-b border-white/10 p-5 pr-14">{header}</div>
        <div className="py-3">
          <NavLinks role={role} variant="drawer" onNavigate={close} />
        </div>
        <div className="mt-auto border-t border-white/10 p-4">{footer}</div>
      </NavDrawer>
    </>
  );
}
