"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";

type Props = {
  productId: string;
  imageUrl: string | null;
  imageSource: string | null;
  imageStatus: string;
  imageApprovedAt: string | null;
  imageFailureReason?: string | null;
};

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    imageUrl?: string;
    message?: string;
    error?: string;
    approved?: boolean;
  };
}

export function ProductImageManager(props: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState(props.imageUrl);
  const [externalUrl, setExternalUrl] = useState("");
  const [prompt, setPrompt] = useState("");

  const sourceLabel =
    props.imageSource === "MERCHANT_UPLOAD"
      ? "Merchant photo"
      : props.imageSource === "AI_GENERATED"
        ? props.imageApprovedAt
          ? "AI illustration — approved"
          : "AI illustration — awaiting approval"
        : props.imageSource === "EXTERNAL_URL"
          ? "External image URL"
          : props.imageStatus === "FAILED"
            ? "Generation failed"
            : "No image";

  async function upload(file: File) {
    setBusy("upload");
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/products/${props.productId}/image`, {
        method: "POST",
        body: form,
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.message ?? "Image upload failed.");
      setPreview(data.imageUrl ?? null);
      setMessage("Product photo uploaded.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function useExternalUrl() {
    setBusy("external");
    setMessage(null);
    try {
      const response = await fetch(`/api/products/${props.productId}/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: externalUrl }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.message ?? "Could not save URL.");
      setPreview(data.imageUrl ?? externalUrl);
      setExternalUrl("");
      setMessage("External product image saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save URL.");
    } finally {
      setBusy(null);
    }
  }

  async function generate(force = false) {
    setBusy("generate");
    setMessage(null);
    try {
      const response = await fetch(
        `/api/products/${props.productId}/image/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customPrompt: prompt.trim() || null,
            force,
          }),
        }
      );
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.message ?? "Generation failed.");
      setPreview(data.imageUrl ?? null);
      setMessage(
        "AI illustration generated. Review and approve it before customers see it."
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    setBusy("approve");
    setMessage(null);
    try {
      const response = await fetch(
        `/api/products/${props.productId}/image/approve`,
        { method: "POST" }
      );
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.message ?? "Approval failed.");
      setMessage("AI illustration approved for customers.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approval failed.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm("Remove this product image?")) return;
    setBusy("remove");
    setMessage(null);
    try {
      const response = await fetch(`/api/products/${props.productId}/image`, {
        method: "DELETE",
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.message ?? "Could not remove image.");
      setPreview(null);
      setMessage("Product image removed.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove image.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-ink-900/10 bg-white p-4 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink-900">Product image</p>
          <p className="text-xs text-ink-500">{sourceLabel}</p>
        </div>
        {props.imageSource === "AI_GENERATED" && !props.imageApprovedAt ? (
          <Button
            type="button"
            variant="secondary"
            disabled={Boolean(busy)}
            onClick={approve}
          >
            {busy === "approve" ? "Approving..." : "Approve illustration"}
          </Button>
        ) : null}
      </div>

      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="Product preview"
          className="h-48 w-full rounded-xl border border-ink-900/10 object-contain"
        />
      ) : (
        <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-ink-900/15 bg-ink-900/[0.02] text-sm text-ink-500">
          No product image
        </div>
      )}

      {props.imageSource === "AI_GENERATED" ? (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
          AI-generated product illustration. Actual item may vary. Review it
          carefully before approving it for customers.
        </p>
      ) : null}
      {props.imageFailureReason ? (
        <p className="text-xs text-red-700">{props.imageFailureReason}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          {busy === "upload" ? "Uploading..." : preview ? "Replace photo" : "Upload photo"}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={Boolean(busy)}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          disabled={Boolean(busy)}
          onClick={() => void generate(Boolean(preview))}
        >
          {busy === "generate" ? "Generating..." : preview ? "Regenerate with AI" : "Generate with AI"}
        </Button>
        {preview ? (
          <Button
            type="button"
            variant="danger"
            disabled={Boolean(busy)}
            onClick={remove}
          >
            {busy === "remove" ? "Removing..." : "Remove"}
          </Button>
        ) : null}
      </div>

      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-ink-700">
          Optional AI prompt
        </span>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          maxLength={1800}
          rows={3}
          placeholder="Leave blank to build a safe prompt from the product name, description, colours and sizes."
          className="w-full rounded-lg border border-ink-900/10 bg-surface-raised px-3 py-2 text-ink-900"
        />
      </label>

      <details className="text-sm text-ink-600">
        <summary className="cursor-pointer font-medium">Advanced: use an image URL</summary>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input
            type="url"
            value={externalUrl}
            onChange={(event) => setExternalUrl(event.target.value)}
            placeholder="https://..."
            aria-label="External product image URL"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!externalUrl.trim() || Boolean(busy)}
            onClick={useExternalUrl}
          >
            {busy === "external" ? "Saving..." : "Use URL"}
          </Button>
        </div>
      </details>

      {message ? (
        <p
          role="status"
          className={message.toLowerCase().includes("failed") ? "text-sm text-red-700" : "text-sm text-emerald-700"}
        >
          {message}
        </p>
      ) : null}
      <p className="text-xs text-ink-500">
        JPG, PNG or WebP, maximum 4 MB. Uploaded photos are shown as merchant
        photos. AI images are always labelled as illustrations.
      </p>
    </section>
  );
}
