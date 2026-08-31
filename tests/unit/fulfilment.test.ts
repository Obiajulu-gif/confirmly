import { describe, it, expect } from "vitest";
import {
  fulfilmentMessage,
  fulfilmentActionLabel,
  nextFulfilmentOptions,
} from "@/lib/orders/fulfilment";

describe("nextFulfilmentOptions", () => {
  it("moves forward one step through the delivery lifecycle", () => {
    expect(nextFulfilmentOptions("RECEIVED", "DELIVERY")).toEqual(["PREPARING"]);
    expect(nextFulfilmentOptions("PREPARING", "DELIVERY")).toEqual(["READY"]);
    expect(nextFulfilmentOptions("READY", "DELIVERY")).toEqual([
      "OUT_FOR_DELIVERY",
    ]);
    expect(nextFulfilmentOptions("OUT_FOR_DELIVERY", "DELIVERY")).toEqual([
      "DELIVERED",
    ]);
  });

  it("skips the out-for-delivery step for pickup orders", () => {
    expect(nextFulfilmentOptions("READY", "PICKUP")).toEqual(["DELIVERED"]);
  });

  it("has no moves before payment or after delivery", () => {
    expect(nextFulfilmentOptions("AWAITING_PAYMENT", "DELIVERY")).toEqual([]);
    expect(nextFulfilmentOptions("DELIVERED", "DELIVERY")).toEqual([]);
  });
});

describe("fulfilmentActionLabel", () => {
  it("labels the final step by delivery method", () => {
    expect(fulfilmentActionLabel("DELIVERED", "PICKUP")).toBe("Mark collected");
    expect(fulfilmentActionLabel("DELIVERED", "DELIVERY")).toBe("Mark delivered");
    expect(fulfilmentActionLabel("READY", "PICKUP")).toBe("Ready for pickup");
  });
});

describe("fulfilmentMessage", () => {
  const ctx = { storeName: "Ada Styles", reference: "CF-2048", pickup: false };

  it("includes the order reference", () => {
    expect(fulfilmentMessage("PREPARING", ctx)).toContain("CF-2048");
    expect(fulfilmentMessage("OUT_FOR_DELIVERY", ctx)).toContain("CF-2048");
  });

  it("differs between pickup and delivery for the terminal step", () => {
    const delivered = fulfilmentMessage("DELIVERED", ctx);
    const collected = fulfilmentMessage("DELIVERED", { ...ctx, pickup: true });
    expect(delivered).toContain("delivered");
    expect(collected).toContain("collected");
    expect(delivered).not.toBe(collected);
  });
});
