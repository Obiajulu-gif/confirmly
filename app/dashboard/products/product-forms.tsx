"use client";

import { useActionState, useState } from "react";
import { Button, Input } from "@/components/ui";
import {
  createProductAction,
  updateProductAction,
  type ProductFormState,
} from "./actions";

const initialState: ProductFormState = { error: null, ok: false };

export function ProductForm({
  product,
}: {
  product?: {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    priceKobo: number;
    aliases: string[];
    stockQuantity: number;
  };
}) {
  const [open, setOpen] = useState(false);
  const action = product ? updateProductAction : createProductAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  if (!open) {
    return (
      <Button
        variant={product ? "ghost" : "primary"}
        onClick={() => setOpen(true)}
      >
        {product ? "Edit" : "+ Add product"}
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-3 grid w-full gap-3 rounded-xl border border-ink-900/10 bg-surface p-4 sm:grid-cols-2"
    >
      {product ? <input type="hidden" name="id" value={product.id} /> : null}
      <Input
        name="name"
        label="Name"
        required
        defaultValue={product?.name}
        placeholder="Classic Polo Shirt"
      />
      <Input
        name="category"
        label="Category"
        defaultValue={product?.category ?? ""}
        placeholder="Tops"
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
        label="Stock"
        type="number"
        min={0}
        required
        defaultValue={product?.stockQuantity ?? 0}
      />
      <div className="sm:col-span-2">
        <Input
          name="aliases"
          label="Aliases (comma-separated — how customers say it)"
          defaultValue={product?.aliases.join(", ") ?? ""}
          placeholder="polo, polo shirt, classic polo"
        />
      </div>
      <div className="sm:col-span-2">
        <Input
          name="description"
          label="Description"
          defaultValue={product?.description ?? ""}
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-700 sm:col-span-2">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : product ? "Save changes" : "Create product"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </form>
  );
}
