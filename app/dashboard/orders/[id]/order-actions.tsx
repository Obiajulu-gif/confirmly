"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function OrderActions({
  orderId,
  paymentId,
  orderState,
  paymentState,
  provider,
}: {
  orderId: string;
  paymentId: string | null;
  orderState: string;
  paymentState: string | null;
  provider: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function call(path: string, label: string) {
    setMessage(null);
    const response = await fetch(path, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      state?: string;
    };
    if (!response.ok) {
      setMessage(`${label} failed: ${data.error ?? response.statusText}`);
    } else {
      setMessage(`${label}: done${data.state ? ` (${data.state})` : ""}`);
      startTransition(() => router.refresh());
    }
  }

  const canVerify =
    paymentId !== null &&
    provider === "MONNIFY" &&
    paymentState !== null;
  const canReinvoice = !["PAID", "COMPLETED", "CANCELLED"].includes(orderState);
  const progressLabel =
    orderState === "PAID" || orderState === "NEEDS_ATTENTION"
      ? "Start fulfilment"
      : orderState === "FULFILLING"
        ? "Mark completed"
        : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canVerify ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => call(`/api/payments/${paymentId}/verify`, "Verify with Monnify")}
          >
            Verify payment now
          </Button>
        ) : null}
        {canReinvoice ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => call(`/api/orders/${orderId}/invoice`, "New invoice")}
          >
            Send fresh payment link
          </Button>
        ) : null}
        {progressLabel ? (
          <Button
            disabled={pending}
            onClick={() => call(`/api/orders/${orderId}/confirm`, progressLabel)}
          >
            {progressLabel}
          </Button>
        ) : null}
      </div>
      {message ? (
        <p role="status" className="text-sm text-ink-500">
          {message}
        </p>
      ) : null}
    </div>
  );
}
