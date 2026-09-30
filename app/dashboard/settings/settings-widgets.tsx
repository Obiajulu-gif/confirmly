"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";

export function StoreLogoWidget({
  merchantId,
  hasLogo,
  targetMerchantId,
}: {
  merchantId: string;
  hasLogo: boolean;
  /** When set (branch pages), authorize + target this specific store. */
  targetMerchantId?: string;
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
      if (targetMerchantId) body.append("merchantId", targetMerchantId);
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
    const url = targetMerchantId
      ? `/api/store-logo?merchantId=${encodeURIComponent(targetMerchantId)}`
      : "/api/store-logo";
    const res = await fetch(url, { method: "DELETE" });
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
      <div className="flex flex-wrap gap-2">
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
