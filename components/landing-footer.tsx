import Link from "next/link";
import { ConfirmlyLogo } from "@/components/logo";

export function LandingFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white text-gray-600">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <ConfirmlyLogo tone="light" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-600">
              From chat to confirmed payment. WhatsApp-native ordering with Monnify-verified settlement.
            </p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-900">
              Product
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {(
                [
                  ["/#how-it-works", "How it works"],
                  ["/#for-merchants", "For merchants"],
                  ["/#security", "Security"],
                  ["/#faq", "FAQ"],
                  ["/stores", "Stores"],
                ] as const
              ).map(([href, label]) => (
                <li key={label}>
                  <Link href={href} className="text-gray-600 transition hover:text-[#17c19a]">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-900">
              Get started
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {(
                [
                  ["/signup", "Create business account"],
                  ["/start", "Order from a store"],
                  ["/login", "Log in"],
                ] as const
              ).map(([href, label]) => (
                <li key={label}>
                  <Link href={href} className="text-gray-600 transition hover:text-[#17c19a]">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-900">
              Powered by
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-gray-600">
              <li>Monnify · payments &amp; settlement</li>
              <li>NVIDIA NIM · order understanding</li>
              <li>WhatsApp Cloud API</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-gray-200 pt-6 text-sm text-gray-500 sm:flex-row">
          <span>© {new Date().getFullYear()} Confirmly. All rights reserved.</span>
          <span>Payments by Monnify · Orders understood by NVIDIA NIM</span>
        </div>
      </div>
    </footer>
  );
}
