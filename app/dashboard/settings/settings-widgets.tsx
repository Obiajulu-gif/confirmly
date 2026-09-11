"use client";

import { useRef, useState } from "react";
import { Button, Input } from "@/components/ui";

export function StoreLogoWidget({
  merchantId,
  hasLogo,
}: {
  merchantId: string;
  hasLogo: boolean;
}) {
  const version = useRef(Date.now());
  const [uploaded, setUploaded] = useState(hasLogo);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const logoSrc = uploaded
    ? `/api/public/merchants/${merchantId}/logo?v=${version.current}`
    : null;

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/store-logo", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        version.current = Date.now();
        setUploaded(true);
        setPreview(null);
        if (fileRef.current) fileRef.current.value = "";
        setResult("Store logo updated. It now shows on your WhatsApp store card.");
      } else {
        setResult(`Failed: ${data.error ?? res.statusText}`);
      }
    } catch {
      setResult("Failed: network error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/store-logo", { method: "DELETE" });
    if (res.ok) {
      setUploaded(false);
      setPreview(null);
      setResult("Logo removed. A branded initials tile is shown instead.");
    } else {
      setResult("Failed to remove logo.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-ink-900/10 bg-ink-900/5">
          {preview || logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview ?? logoSrc!}
              alt="Store logo preview"
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-center text-[10px] text-ink-500">
              Auto tile
            </div>
          )}
        </div>
        <div className="text-sm text-ink-500">
          Shown on your store card in the WhatsApp store picker. Square images
          work best (PNG/JPG/WebP). No logo? A branded initials tile is generated
          automatically.
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          setPreview(f ? URL.createObjectURL(f) : null);
          setResult(null);
        }}
        className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-900/5 file:px-3 file:py-2 file:text-sm file:font-medium"
      />
      <div className="flex gap-2">
        <Button disabled={busy} onClick={upload}>
          {busy ? "Saving…" : "Upload logo"}
        </Button>
        {uploaded ? (
          <Button variant="secondary" disabled={busy} onClick={remove}>
            Remove
          </Button>
        ) : null}
      </div>
      {result ? (
        <p role="status" className="text-sm text-ink-500">
          {result}
        </p>
      ) : null}
    </div>
  );
}

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
      <div className="flex gap-2">
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

export function DemoResetWidget() {
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reset() {
    if (!window.confirm("Reset demo data? Tagged demo orders will be wiped and re-seeded.")) {
      return;
    }
    setBusy(true);
    setResult(null);
    const response = await fetch("/api/demo/reset", { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as {
      paidOrderReference?: string;
      error?: string;
    };
    setResult(
      response.ok
        ? `Demo data reset — paid example: ${data.paidOrderReference}`
        : `Failed: ${data.error ?? response.statusText}`
    );
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" disabled={busy} onClick={reset}>
        {busy ? "Resetting…" : "Reset demo data"}
      </Button>
      {result ? (
        <p role="status" className="text-sm text-ink-500">
          {result}
        </p>
      ) : null}
    </div>
  );
}

export function ReconcileWidget() {
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setResult(null);
    const response = await fetch("/api/payments/reconcile", { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as {
      checked?: number;
      transitioned?: number;
      error?: string;
    };
    setResult(
      response.ok
        ? `Checked ${data.checked} pending payment(s); ${data.transitioned} transitioned.`
        : `Failed: ${data.error ?? response.statusText}`
    );
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" disabled={busy} onClick={run}>
        {busy ? "Reconciling…" : "Reconcile pending payments now"}
      </Button>
      {result ? (
        <p role="status" className="text-sm text-ink-500">
          {result}
        </p>
      ) : null}
    </div>
  );
}
