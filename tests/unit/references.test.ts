import { describe, expect, it } from "vitest";
import {
  generateOrderReference,
  generateInvoiceReference,
  generateReceiptToken,
  webhookEventKey,
} from "@/lib/references";

describe("references", () => {
  it("order references follow the CFY- format and are unique", () => {
    const refs = new Set(
      Array.from({ length: 500 }, () => generateOrderReference())
    );
    expect(refs.size).toBe(500);
    for (const ref of refs) {
      expect(ref).toMatch(/^CFY-[2-9A-HJKMNP-Z]{8}$/);
    }
  });

  it("every payment attempt gets a fresh invoice reference", () => {
    const a = generateInvoiceReference("CFY-TEST1234", 1);
    const b = generateInvoiceReference("CFY-TEST1234", 2);
    const c = generateInvoiceReference("CFY-TEST1234", 2);
    expect(a).not.toBe(b);
    expect(b).not.toBe(c); // same attempt number still differs (random suffix)
    expect(a).toContain("CFY-TEST1234-P1-");
    expect(b).toContain("CFY-TEST1234-P2-");
  });

  it("receipt tokens are high-entropy and URL-safe", () => {
    const tokens = new Set(
      Array.from({ length: 200 }, () => generateReceiptToken())
    );
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
    }
  });

  it("webhook event keys skip null parts deterministically", () => {
    expect(webhookEventKey("monnify", ["A", null, "B", undefined])).toBe(
      "monnify:A:B"
    );
  });
});
