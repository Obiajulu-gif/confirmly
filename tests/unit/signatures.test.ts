import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyMetaSignature } from "@/lib/whatsapp/signature";
import {
  computeMonnifySignature,
  verifyMonnifySignature,
} from "@/lib/monnify/signature";

describe("Meta X-Hub-Signature-256", () => {
  const secret = "test-app-secret";
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const good = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  it("accepts a valid signature", () => {
    expect(verifyMetaSignature(body, good, secret)).toBe(true);
  });
  it("rejects a tampered body", () => {
    expect(verifyMetaSignature(body + " ", good, secret)).toBe(false);
  });
  it("rejects a wrong secret", () => {
    expect(verifyMetaSignature(body, good, "other-secret")).toBe(false);
  });
  it("rejects missing/malformed headers", () => {
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
    expect(verifyMetaSignature(body, "sha1=abc", secret)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=zzzz", secret)).toBe(false);
  });
});

describe("Monnify monnify-signature (HMAC-SHA512)", () => {
  const secret = "monnify-secret";
  const body = JSON.stringify({
    eventType: "SUCCESSFUL_TRANSACTION",
    eventData: { transactionReference: "MNFY|X|123" },
  });

  it("round-trips compute + verify", () => {
    const sig = computeMonnifySignature(body, secret);
    expect(verifyMonnifySignature(body, sig, secret)).toBe(true);
  });
  it("rejects tampered payloads", () => {
    const sig = computeMonnifySignature(body, secret);
    expect(verifyMonnifySignature(body.replace("123", "999"), sig, secret)).toBe(
      false
    );
  });
  it("rejects wrong secrets and empty headers", () => {
    const sig = computeMonnifySignature(body, "another");
    expect(verifyMonnifySignature(body, sig, secret)).toBe(false);
    expect(verifyMonnifySignature(body, null, secret)).toBe(false);
    expect(verifyMonnifySignature(body, "", secret)).toBe(false);
  });
});
