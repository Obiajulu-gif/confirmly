"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, ArrowRight, Store } from "lucide-react";
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

  // Prevent background scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <header className="sticky top-0 z-40 w-full px-4 pt-3 sm:px-6 sm:pt-4 pointer-events-none transition-all duration-300">
      <nav
        aria-label="Main navigation"
        className="relative z-50 mx-auto flex max-w-6xl items-center justify-between pointer-events-auto"
      >
        {/* ----------------- 1. LEFT PILL: Brand Logo ----------------- */}
        <div className="flex-1 flex items-center justify-start">
          <Link
            href="/"
            aria-label="Confirmly home"
            className={`group inline-flex items-center rounded-full border border-white/10 bg-night-800/85 backdrop-blur-xl px-3.5 py-2 sm:px-5 sm:py-2.5 shadow-lg shadow-black/25 transition-all duration-200 hover:border-white/20 hover:bg-night-800 ${
              scrolled ? "shadow-black/40 border-white/15" : ""
            }`}
          >
            <ConfirmlyLogo tone="dark" className="h-6 sm:h-7" />
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

        {/* ----------------- 3. RIGHT PILL: Auth Actions (Desktop) / Mobile Toggle ----------------- */}
        <div className="flex-1 flex items-center justify-end">
          {/* Desktop Auth Capsule (Hidden on mobile/tablet < md) */}
          <div
            className={`hidden md:inline-flex items-center gap-3 rounded-full border border-white/10 bg-night-800/85 backdrop-blur-xl p-1.5 pl-4 sm:pl-5 shadow-lg shadow-black/25 transition-all duration-200 ${
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

          {/* Standalone Mobile Hamburger Button (No attached Get Started) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
            className="inline-flex md:hidden items-center justify-center h-11 w-11 rounded-full border border-white/10 bg-night-800/85 backdrop-blur-xl text-white/90 shadow-lg shadow-black/25 transition hover:text-white hover:border-white/20 active:scale-95"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {/* ----------------- Mobile Backdrop Overlay ----------------- */}
      {mobileMenuOpen ? (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden pointer-events-auto transition-opacity duration-200"
          aria-hidden="true"
        />
      ) : null}

      {/* ----------------- Mobile Drawer / Slide-Down Menu ----------------- */}
      {mobileMenuOpen ? (
        <div className="relative z-50 md:hidden mx-auto mt-3 w-full max-w-sm rounded-3xl border border-white/15 bg-night-800/95 backdrop-blur-2xl p-5 shadow-2xl shadow-black/70 pointer-events-auto anim-fade-in">
          {/* Nav links */}
          <ul className="space-y-1">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/5 hover:text-white"
                >
                  <span>{link.label}</span>
                  <span className="text-white/25 text-xs">→</span>
                </a>
              </li>
            ))}
          </ul>

          {/* Action buttons inside the menu */}
          <div className="mt-4 border-t border-white/10 pt-4 flex flex-col gap-2.5">
            {/* Order in Store button */}
            <Link
              href="/start"
              onClick={() => setMobileMenuOpen(false)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-brand-500/35 bg-brand-500/10 py-3 text-sm font-bold text-brand-300 transition hover:bg-brand-500/20 active:scale-98"
            >
              <Store className="h-4 w-4 text-brand-400" />
              Order in store
            </Link>

            {/* Get Started button */}
            <Link
              href="/signup"
              onClick={() => setMobileMenuOpen(false)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3 text-sm font-bold text-night-900 shadow-md shadow-brand-500/25 transition hover:bg-brand-400 active:scale-98"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Link>

            {/* Sign In button */}
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              Sign In
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
