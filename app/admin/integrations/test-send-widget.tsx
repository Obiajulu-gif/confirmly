"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";

/** Admin-only: sends a WhatsApp test message from the platform number. */
export function TestSendWidget() {
  const [to, setTo] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(mode: "template" | "text") {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          mode,
          text:
            mode === "text"
              ? "Confirmly test message — your WhatsApp integration works."
              : undefined,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        providerMessageId?: string;
        error?: string;
        note?: string;
      };
      setResult(
        response.ok
          ? `Sent (id ${data.providerMessageId?.slice(0, 18)}…). ${data.note ?? ""}`
          : `Failed: ${data.error ?? response.statusText}`
      );
    } catch {
      setResult("Failed: network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Input
        id="test-to"
        label="Recipient (international format, must be a verified test number)"
        placeholder="+2348012345678"
        value={to}
        onChange={(e) => setTo(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !to} onClick={() => send("template")}>
          Send hello_world template
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !to}
          onClick={() => send("text")}
        >
          Send text
        </Button>
      </div>
      {result ? (
        <p role="status" className="text-sm text-ink-500">
          {result}
        </p>
      ) : null}
      <p className="text-xs text-ink-500">
        Meta&apos;s test number can only message recipients added as verified
        test numbers in the Meta developer dashboard. Free-form text is only
        delivered inside a 24-hour customer service window — the template
        always works.
      </p>
    </div>
  );
}
