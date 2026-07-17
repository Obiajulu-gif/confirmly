import { z } from "zod";

/**
 * Strict schema for AI order-intent extraction. The model proposes intent —
 * it never decides commerce truth. Anything money-related is intentionally
 * absent from this schema.
 */

export const orderIntentSchema = z.object({
  intent: z.enum([
    "PLACE_ORDER",
    "EDIT_ORDER",
    "CANCEL_ORDER",
    "PAYMENT_QUESTION",
    "HUMAN_HELP",
    "BUSINESS_QUESTION",
    "OTHER",
  ]),
  items: z.array(
    z.object({
      searchTerm: z.string().min(1).max(120),
      quantity: z.number().int().min(1).max(999),
      size: z.string().max(24).nullable(),
      colour: z.string().max(24).nullable(),
    })
  ),
  deliveryMethod: z.enum(["DELIVERY", "PICKUP"]).nullable(),
  deliveryAddress: z.string().max(300).nullable(),
  deliveryArea: z.string().max(120).nullable(),
  customerName: z.string().max(120).nullable(),
  notes: z.string().max(500).nullable(),
  missingFields: z.array(z.string().max(60)),
});

export type OrderIntent = z.infer<typeof orderIntentSchema>;

export const EMPTY_INTENT: OrderIntent = {
  intent: "OTHER",
  items: [],
  deliveryMethod: null,
  deliveryAddress: null,
  deliveryArea: null,
  customerName: null,
  notes: null,
  missingFields: [],
};
