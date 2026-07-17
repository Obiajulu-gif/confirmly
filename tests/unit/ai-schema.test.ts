import { describe, expect, it } from "vitest";
import { orderIntentSchema } from "@/lib/ai/schema";
import { extractJsonObject } from "@/lib/ai/nvidia";

const validIntent = {
  intent: "PLACE_ORDER",
  items: [{ searchTerm: "polo", quantity: 2, size: "L", colour: "black" }],
  deliveryMethod: "DELIVERY",
  deliveryAddress: null,
  deliveryArea: "Yaba",
  customerName: null,
  notes: null,
  missingFields: [],
};

describe("order intent schema", () => {
  it("accepts a valid intent", () => {
    expect(orderIntentSchema.safeParse(validIntent).success).toBe(true);
  });

  it("strips money fields the model must never produce", () => {
    const parsed = orderIntentSchema.parse({
      ...validIntent,
      price: 99, // AI-invented price
      items: [{ ...validIntent.items[0], unitPrice: 1 }],
    } as never);
    expect("price" in parsed).toBe(false);
    expect("unitPrice" in (parsed.items[0] as object)).toBe(false);
  });

  it("rejects unknown intents", () => {
    expect(
      orderIntentSchema.safeParse({ ...validIntent, intent: "GIVE_DISCOUNT" })
        .success
    ).toBe(false);
  });

  it("rejects invalid quantities", () => {
    for (const quantity of [0, -2, 2.5, 10_000]) {
      expect(
        orderIntentSchema.safeParse({
          ...validIntent,
          items: [{ searchTerm: "polo", quantity, size: null, colour: null }],
        }).success
      ).toBe(false);
    }
  });

  it("rejects missing required fields", () => {
    expect(orderIntentSchema.safeParse({ intent: "OTHER" }).success).toBe(false);
  });
});

describe("extractJsonObject (malformed model output)", () => {
  it("unwraps markdown fences", () => {
    const raw = "```json\n{\"a\": 1}\n```";
    expect(extractJsonObject(raw)).toBe('{"a": 1}');
  });
  it("ignores prose around the object", () => {
    const raw = 'Sure! Here is the JSON: {"a": {"b": 2}} Hope that helps.';
    expect(extractJsonObject(raw)).toBe('{"a": {"b": 2}}');
  });
  it("returns null when no object exists", () => {
    expect(extractJsonObject("no json here")).toBeNull();
  });
});
