"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, ArrowRight } from "lucide-react";
import { ConfirmlyLogo } from "./logo";

const navLinks = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#for-merchants", label: "For merchants" },
  { href: "#security", label: "Security" },
  { href: "#faq", label: "FAQ" },
] as const;

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on Esc key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full px-4 pt-3.5 sm:px-6 sm:pt-5 pointer-events-none transition-all duration-300">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex max-w-6xl items-center justify-between pointer-events-auto"
      >
        {/* ----------------- 1. LEFT PILL: Brand Logo ----------------- */}
        <div className="flex-1 flex items-center justify-start">
          <Link
            href="/"
            aria-label="Confirmly home"
            className={`group inline-flex items-center rounded-full border border-white/10 bg-night-800/85 backdrop-blur-xl px-4 py-2 sm:px-5 sm:py-2.5 shadow-lg shadow-black/25 transition-all duration-200 hover:border-white/20 hover:bg-night-800 ${
              scrolled ? "shadow-black/40 border-white/15" : ""
            }`}
          >
            <ConfirmlyLogo tone="dark" className="h-7 sm:h-8" />
          </Link>
        </div>

        {/* ----------------- 2. CENTER PILL: Section Links (Desktop) ----------------- */}
        <div className="hidden md:flex items-center justify-center">
          <div
            className={`inline-flex items-center gap-7 lg:gap-8 rounded-full border border-white/10 bg-night-800/85 backdrop-blur-xl px-7 py-2.5 shadow-lg shadow-black/25 transition-all duration-200 ${
              scrolled ? "shadow-black/40 border-white/15" : ""
            }`}
          >
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-[13.5px] font-semibold text-white/70 transition-colors duration-150 hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>

        {/* ----------------- 3. RIGHT PILL: Auth Actions (Desktop) ----------------- */}
        <div className="flex-1 flex items-center justify-end">
          {/* Desktop Auth Capsule */}
          <div
            className={`hidden sm:inline-flex items-center gap-3 rounded-full border border-white/10 bg-night-800/85 backdrop-blur-xl p-1.5 pl-4 sm:pl-5 shadow-lg shadow-black/25 transition-all duration-200 ${
              scrolled ? "shadow-black/40 border-white/15" : ""
            }`}
          >
            <Link
              href="/login"
              className="text-[13.5px] font-semibold text-white/75 transition-colors duration-150 hover:text-white px-1"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-brand-500 px-4 py-2 text-[13.5px] font-bold text-night-900 transition-all duration-150 hover:bg-brand-400 active:scale-95 shadow-sm shadow-brand-500/20"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile Actions (Under `sm:`) */}
          <div className="flex sm:hidden items-center gap-2">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-brand-500 px-3.5 py-1.5 text-xs font-bold text-night-900 shadow-sm shadow-brand-500/20 active:scale-95"
            >
              Get Started
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-night-800/85 backdrop-blur-xl p-2 text-white/80 transition hover:text-white hover:border-white/20"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          {/* Tablet Hamburger (Between `sm` and `md`) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            className="hidden sm:inline-flex md:hidden items-center justify-center rounded-full border border-white/10 bg-night-800/85 backdrop-blur-xl p-2 text-white/80 ml-2 transition hover:text-white hover:border-white/20"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {/* ----------------- Mobile Drawer / Slide-Down Menu ----------------- */}
      {mobileMenuOpen ? (
        <div className="md:hidden mx-auto mt-3 max-w-sm rounded-3xl border border-white/10 bg-night-800/95 backdrop-blur-2xl p-5 shadow-2xl shadow-black/50 pointer-events-auto anim-fade-in">
          <ul className="space-y-3">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block rounded-xl px-3 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/5 hover:text-white"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t border-white/10 pt-4 flex flex-col gap-2.5">
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              onClick={() => setMobileMenuOpen(false)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-500 py-2.5 text-sm font-bold text-night-900 transition hover:bg-brand-400"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
