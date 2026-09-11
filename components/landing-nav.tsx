"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, ArrowRight } from "lucide-react";
import { ConfirmlyLogo } from "@/components/logo";

export function LandingNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close menu on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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

  const navLinks = [
    { href: "#how-it-works", label: "How it works" },
    { href: "#for-merchants", label: "For merchants" },
    { href: "#security", label: "Security" },
    { href: "#faq", label: "FAQ" },
  ];

  return (
    <header className="sticky top-0 z-40 bg-transparent py-3 px-3 sm:py-4 sm:px-6 lg:px-8">
      <div className="relative mx-auto flex w-full max-w-7xl items-center justify-between gap-2 sm:gap-4">
        {/* Left Container: Rounded pill for Logo */}
        <div className="flex items-center rounded-full bg-white/95 px-3.5 py-2 sm:px-5 sm:py-2.5 shadow-sm border border-gray-200/80 backdrop-blur-md transition hover:shadow-md">
          <Link href="/" aria-label="Confirmly home" className="flex items-center">
            <ConfirmlyLogo markClassName="h-6 w-6 sm:h-8 sm:w-8" className="text-base sm:text-lg" />
          </Link>
        </div>

        {/* Center Container: Rounded pill for Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-7 lg:gap-8 rounded-full bg-white/95 px-7 lg:px-8 py-3.5 shadow-sm border border-gray-200/80 backdrop-blur-md text-sm font-semibold text-[#111827] transition hover:shadow-md">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition hover:text-[#17c19a]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right Container: Desktop Auth/CTA & Mobile Hamburger */}
        {/* Desktop Container */}
        <div className="hidden md:flex items-center gap-2 rounded-full bg-white/95 p-1.5 pl-4 shadow-sm border border-gray-200/80 backdrop-blur-md transition hover:shadow-md">
          <Link
            href="/login"
            className="text-sm font-semibold text-[#111827] transition hover:text-[#17c19a] pr-2"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full bg-[#17c19a] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#0fa17f] active:scale-95"
          >
            Get Started
          </Link>
        </div>

        {/* Mobile Hamburger Pill Button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          className="inline-flex md:hidden items-center justify-center rounded-full bg-white/95 p-2.5 shadow-sm border border-gray-200/80 backdrop-blur-md text-gray-800 hover:text-[#17c19a] focus:outline-none transition active:scale-95"
        >
          {mobileMenuOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>

        {/* Mobile Navigation Island Drawer */}
        {mobileMenuOpen && (
          <>
            {/* Backdrop overlay */}
            <div
              className="fixed inset-0 top-[58px] bg-black/25 backdrop-blur-xs z-40 md:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Floating rounded card */}
            <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-3xl bg-white/95 backdrop-blur-xl border border-gray-200/90 p-5 shadow-2xl md:hidden">
              <nav className="flex flex-col gap-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-between rounded-2xl px-4 py-3 text-base font-semibold text-[#111827] hover:bg-gray-50 hover:text-[#17c19a] transition"
                  >
                    <span>{link.label}</span>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                  </Link>
                ))}
              </nav>

              <div className="my-3 border-t border-gray-100" />

              <div className="flex flex-col gap-2.5 pt-1">
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center block rounded-2xl py-3 text-base font-semibold text-[#111827] hover:bg-gray-50 transition border border-gray-200"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center block rounded-full py-3.5 text-base font-bold text-white bg-[#17c19a] hover:bg-[#0fa17f] shadow-lg shadow-[#17c19a]/25 transition active:scale-95"
                >
                  Get Started
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
