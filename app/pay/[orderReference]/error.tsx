"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw, ArrowLeft } from "lucide-react";
import { ConfirmlyLogo } from "@/components/logo";

export default function PayErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("PayPage error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-8">
      <div className="mb-8 flex justify-center">
        <ConfirmlyLogo />
      </div>
      <div className="rounded-card border border-ink-900/10 bg-surface-raised p-6 shadow-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-bold text-ink-900">
          Payment Status Check
        </h1>
        <p className="mt-2 text-sm text-ink-600 leading-relaxed">
          We encountered a temporary error loading your order details. If your payment was already completed, your receipt is safe and has been sent to your WhatsApp.
        </p>

        {error.digest ? (
          <p className="mt-2 text-xs font-mono text-ink-400">
            Reference code: {error.digest}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={() => reset()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition shadow-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
          <Link
            href="/"
            className="flex items-center justify-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-900 transition py-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Confirmly
          </Link>
        </div>
      </div>
    </div>
  );
}
