"use client";

import { useActionState, useMemo, useState } from "react";
import { Button, Input } from "@/components/ui";
import { ProductImageManager } from "./product-image-manager";
import {
  createProductAction,
  createZoneAction,
  updateProductAction,
  type ProductFormState,
  type ZoneFormState,
} from "./actions";

const productInitialState: ProductFormState = { error: null, ok: false };
const zoneInitialState: ZoneFormState = { error: null, ok: false };

type ProductInput = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  priceKobo: number;
  aliases: string[];
  stockQuantity: number;
  imageUrl: string | null;
  imageSource: string | null;
  imageStatus: string;
  imageApprovedAt: string | null;
  imageFailureReason: string | null;
  variants: Array<{
    size: string | null;
    colour: string | null;
  }>;
};

export function ProductForm({ product }: { product?: ProductInput }) {
  const [open, setOpen] = useState(false);
  const action = product ? updateProductAction : createProductAction;
  const [state, formAction, pending] = useActionState(
    action,
    productInitialState
  );

  const sizes = useMemo(
    () =>
      [
        ...new Set(
          product?.variants
            .map((variant) => variant.size)
            .filter((value): value is string => Boolean(value)) ?? []
        ),
      ].join(", "),
    [product]
  );
  const colours = useMemo(
    () =>
      [
        ...new Set(
          product?.variants
            .map((variant) => variant.colour)
            .filter((value): value is string => Boolean(value)) ?? []
        ),
      ].join(", "),
    [product]
  );

  if (!open) {
    return (
      <Button
        variant={product ? "ghost" : "primary"}
        onClick={() => setOpen(true)}
      >
        {product ? "Edit" : "Add product"}
      </Button>
    );
  }

  const imageProductId = product?.id ?? state.productId;

  return (
    <form
      action={formAction}
      className="mt-3 grid w-full gap-3 rounded-xl border border-ink-900/10 bg-surface p-4 sm:grid-cols-2"
    >
      {product ? <input type="hidden" name="id" value={product.id} /> : null}
      <Input
        name="name"
        label="Product name"
        required
        defaultValue={product?.name}
        placeholder="Reflective Safety Vest"
      />
      <Input
        name="category"
        label="Category"
        defaultValue={product?.category ?? ""}
        placeholder="Driver Essentials"
      />
      <Input
        name="priceNaira"
        label="Price (NGN)"
        type="number"
        min={0}
        step="0.01"
        required
        defaultValue={product ? product.priceKobo / 100 : ""}
      />
      <Input
        name="stockQuantity"
        label="Stock per option"
        type="number"
        min={0}
        required
        defaultValue={product?.stockQuantity ?? 0}
      />
      <Input
        name="variantSizes"
        label="Sizes (comma-separated)"
        defaultValue={sizes}
        placeholder="S, M, L, XL"
      />
      <Input
        name="variantColours"
        label="Colours (comma-separated)"
        defaultValue={colours}
        placeholder="Black, White, Navy"
      />
      <div className="sm:col-span-2">
        <Input
          name="aliases"
          label="Aliases customers may use"
          defaultValue={product?.aliases.join(", ") ?? ""}
          placeholder="vest, safety vest, reflective jacket"
        />
      </div>
      <div className="sm:col-span-2">
        <label
          htmlFor={`description-${product?.id ?? "new"}`}
          className="mb-1.5 block text-sm font-medium text-ink-700"
        >
          Description
        </label>
        <textarea
          id={`description-${product?.id ?? "new"}`}
          name="description"
          rows={3}
          defaultValue={product?.description ?? ""}
          className="w-full rounded-xl border border-ink-900/10 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-700 sm:col-span-2">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-emerald-700 sm:col-span-2">
          Product saved successfully. You can attach its product image below.
        </p>
      ) : null}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : product ? "Save changes" : "Create product"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      {imageProductId ? (
        <ProductImageManager
          productId={imageProductId}
          imageUrl={product?.imageUrl ?? null}
          imageSource={product?.imageSource ?? null}
          imageStatus={product?.imageStatus ?? "NONE"}
          imageApprovedAt={product?.imageApprovedAt ?? null}
          imageFailureReason={product?.imageFailureReason ?? null}
        />
      ) : (
        <p className="text-xs text-ink-500 sm:col-span-2">
          Save the product first, then upload a real photo or generate an AI
          illustration without leaving this form.
        </p>
      )}
    </form>
  );
}

export function ZoneForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    createZoneAction,
    zoneInitialState
  );

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Add delivery zone
      </Button>
    );
  }

  return (
    <form
      action={action}
      className="mt-3 grid gap-3 rounded-xl border border-ink-900/10 bg-surface p-4 sm:grid-cols-3"
    >
      <Input name="name" label="Area name" required placeholder="Yaba" />
      <Input
        name="aliases"
        label="Aliases"
        placeholder="Akoka, UNILAG, Sabo"
      />
      <Input
        name="feeNaira"
        type="number"
        min={0}
        step="0.01"
        label="Delivery fee (NGN)"
        required
      />
      {state.error ? (
        <p className="text-sm text-red-700 sm:col-span-3" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-emerald-700 sm:col-span-3">
          Delivery zone added.
        </p>
      ) : null}
      <div className="flex gap-2 sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding..." : "Add zone"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </form>
  );
}
