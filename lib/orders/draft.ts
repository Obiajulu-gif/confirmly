import { z } from "zod";

/** Conversation draft stored as JSON on the Conversation row. */

export const draftItemSchema = z.object({
  searchTerm: z.string(),
  quantity: z.number().int().min(1).max(999),
  size: z.string().nullable(),
  colour: z.string().nullable(),
  status: z.enum(["matched", "ambiguous", "unmatched"]),
  productId: z.string().nullable(),
  productName: z.string().nullable(),
  variantId: z.string().nullable(),
  variantLabel: z.string().nullable(),
  /** Server-derived price snapshot for the summary (DB truth, not AI). */
  unitPriceKobo: z.number().int().min(0).nullable(),
  alternatives: z
    .array(z.object({ productId: z.string(), name: z.string() }))
    .default([]),
});

export const draftSchema = z.object({
  items: z.array(draftItemSchema).default([]),
  deliveryMethod: z.enum(["DELIVERY", "PICKUP"]).nullable().default(null),
  deliveryArea: z.string().nullable().default(null),
  deliveryZoneId: z.string().nullable().default(null),
  deliveryZoneName: z.string().nullable().default(null),
  deliveryFeeKobo: z.number().int().min(0).nullable().default(null),
  deliveryAddress: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
});

export type DraftItem = z.infer<typeof draftItemSchema>;
export type Draft = z.infer<typeof draftSchema>;

export const EMPTY_DRAFT: Draft = {
  items: [],
  deliveryMethod: null,
  deliveryArea: null,
  deliveryZoneId: null,
  deliveryZoneName: null,
  deliveryFeeKobo: null,
  deliveryAddress: null,
  notes: null,
};

export function parseDraft(value: unknown): Draft {
  const parsed = draftSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : { ...EMPTY_DRAFT };
}
