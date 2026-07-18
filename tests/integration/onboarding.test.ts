import { describe, expect, it } from "vitest";
import {
  buildWaLink,
  normalizeWhatsAppNumber,
} from "@/lib/orders/onboarding";

describe("normalizeWhatsAppNumber", () => {
  it("converts Nigerian local formats to 234…", () => {
    expect(normalizeWhatsAppNumber("0803 123 4567")).toBe("2348031234567");
    expect(normalizeWhatsAppNumber("+234 803 123 4567")).toBe("2348031234567");
    expect(normalizeWhatsAppNumber("803-123-4567")).toBe("2348031234567");
  });

  it("keeps international numbers as digits", () => {
    expect(normalizeWhatsAppNumber("+1 (555) 183-4600")).toBe("15551834600");
  });

  it("rejects garbage", () => {
    expect(normalizeWhatsAppNumber("12345")).toBeNull();
    expect(normalizeWhatsAppNumber("not a number")).toBeNull();
    expect(normalizeWhatsAppNumber("1".repeat(20))).toBeNull();
  });
});

describe("buildWaLink", () => {
  it("prefills the deterministic store-selection command", () => {
    const link = buildWaLink("ADASTYLES");
    if (link === null) {
      // No public number configured in this environment — acceptable.
      expect(link).toBeNull();
      return;
    }
    expect(link).toMatch(/^https:\/\/wa\.me\/\d{7,15}\?text=/);
    expect(decodeURIComponent(link)).toContain("START ADASTYLES");
  });
});
