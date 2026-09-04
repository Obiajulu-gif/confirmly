"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Near-real-time inbox: re-runs the server component on an interval while the
 * tab is visible (and immediately when it regains focus), so new customer
 * messages and status changes appear without a manual refresh. Polling pauses
 * when the tab is hidden to avoid needless load.
 */
export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);
  return null;
}
