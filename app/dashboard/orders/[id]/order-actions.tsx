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
  fulfilmentStatus,
  fulfilmentOptions,
}: {
  orderId: string;
  paymentId: string | null;
  orderState: string;
  paymentState: string | null;
  provider: string | null;
  fulfilmentStatus: string;
  fulfilmentOptions: { to: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function call(
    path: string,
    label: string,
    body?: Record<string, unknown>
  ) {
    setMessage(null);
    const response = await fetch(path, {
      method: "POST",
      ...(body
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      status?: string;
      state?: string;
      notified?: boolean;
    };
    if (!response.ok) {
      setMessage(`${label} failed: ${data.error ?? response.statusText}`);
    } else {
      const notice =
        data.notified === false
          ? " — status updated, but the customer couldn't be reached on WhatsApp right now"
          : data.notified === true
            ? " — customer notified on WhatsApp"
            : data.state
              ? ` (${data.state})`
              : "";
      setMessage(`${label}${notice}`);
      startTransition(() => router.refresh());
    }
  }

  const canVerify =
    paymentId !== null && provider === "MONNIFY" && paymentState !== null;
  const canReinvoice = !["PAID", "COMPLETED", "CANCELLED"].includes(orderState);

  return (
    <div className="space-y-4">
      {/* Fulfilment lifecycle */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
          Fulfilment
        </p>
        {fulfilmentStatus === "AWAITING_PAYMENT" ? (
          <p className="text-sm text-ink-500">
            Fulfilment actions unlock once payment is verified.
          </p>
        ) : fulfilmentOptions.length === 0 ? (
          <p className="text-sm text-ink-500">
            {fulfilmentStatus === "DELIVERED"
              ? "This order is delivered — nothing left to do."
              : "No further fulfilment steps."}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {fulfilmentOptions.map((option) => (
              <Button
                key={option.to}
                disabled={pending}
                onClick={() =>
                  call(`/api/orders/${orderId}/fulfilment`, option.label, {
                    to: option.to,
                  })
                }
              >
                {option.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Payment actions */}
      {(canVerify || canReinvoice) && (
        <div className="border-t border-ink-900/5 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
            Payment
          </p>
          <div className="flex flex-wrap gap-2">
            {canVerify ? (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  call(`/api/payments/${paymentId}/verify`, "Verify with Monnify")
                }
              >
                Verify payment now
              </Button>
            ) : null}
            {canReinvoice ? (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  call(`/api/orders/${orderId}/invoice`, "New invoice")
                }
              >
                Send fresh payment link
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {message ? (
        <p role="status" className="text-sm text-ink-500">
          {message}
        </p>
      ) : null}
    </div>
  );
}
