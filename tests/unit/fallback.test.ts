import { describe, expect, it } from "vitest";
import { fallbackExtract } from "@/lib/ai/fallback";

/**
 * The deterministic fallback parser evaluated against the required test
 * utterances (Nigerian English and Pidgin included).
 */
describe("deterministic fallback parser", () => {
  it("parses: I want two black polos in large, deliver to Yaba", () => {
    const intent = fallbackExtract(
      "I want two black polos in large, deliver to Yaba."
    );
    expect(intent.intent).toBe("PLACE_ORDER");
    expect(intent.items[0]?.quantity).toBe(2);
    expect(intent.items[0]?.searchTerm).toContain("polo");
    expect(intent.items[0]?.colour).toBe("black");
    expect(intent.deliveryArea?.toLowerCase()).toContain("yaba");
  });

  it("parses Pidgin: Abeg give me three polo and one tote bag, bring am come Yaba", () => {
    const intent = fallbackExtract(
      "Abeg give me three polo and one tote bag, bring am come Yaba"
    );
    expect(intent.intent).toBe("PLACE_ORDER");
    expect(intent.items.length).toBe(2);
    expect(intent.items[0]?.quantity).toBe(3);
    expect(intent.items[1]?.quantity).toBe(1);
    expect(intent.items[1]?.searchTerm).toContain("tote");
  });

  it("parses multiple unfamiliar items: one malt and two meat pies", () => {
    const intent = fallbackExtract(
      "Please add one malt and two meat pies, send to UNILAG gate."
    );
    expect(intent.intent).toBe("PLACE_ORDER");
    expect(intent.items.length).toBe(2);
    // The parser extracts intent — the catalogue matcher decides validity.
    expect(intent.items[0]?.searchTerm).toContain("malt");
  });

  it("preserves ambiguity: I need the black shirt (no quantity)", () => {
    const intent = fallbackExtract("I need the black shirt.");
    expect(intent.intent).toBe("PLACE_ORDER");
    expect(intent.items[0]?.colour).toBe("black");
    expect(intent.missingFields).toContain("quantity");
  });

  it("treats 'Make it three, not two' as a quantity edit", () => {
    const intent = fallbackExtract("Make it three, not two.");
    expect(intent.intent).toBe("EDIT_ORDER");
    expect(intent.items[0]?.quantity).toBe(3);
  });

  it("routes 'I want to speak with the seller' to HUMAN_HELP", () => {
    expect(fallbackExtract("I want to speak with the seller.").intent).toBe(
      "HUMAN_HELP"
    );
  });

  it("treats payment claims as unverified PAYMENT_QUESTION", () => {
    expect(fallbackExtract("I have paid, check the screenshot.").intent).toBe(
      "PAYMENT_QUESTION"
    );
    expect(fallbackExtract("I don transfer, see alert").intent).toBe(
      "PAYMENT_QUESTION"
    );
  });

  it("routes business questions", () => {
    expect(fallbackExtract("What time do you close?").intent).toBe(
      "BUSINESS_QUESTION"
    );
  });

  it("never invents money fields", () => {
    const intent = fallbackExtract("I want two polos");
    expect(JSON.stringify(intent)).not.toMatch(/price|fee|discount|amount/i);
  });
});
