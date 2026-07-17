import { describe, expect, it } from "vitest";
import {
  calculateOrderTotal,
  formatNaira,
  koboToNairaAmount,
  nairaAmountToKobo,
  MoneyError,
} from "@/lib/money";

describe("calculateOrderTotal", () => {
  it("computes the canonical demo order: 2 polos + Yaba delivery = NGN 26,500", () => {
    const result = calculateOrderTotal({
      items: [{ unitPriceKobo: 1_200_000, quantity: 2 }],
      deliveryFeeKobo: 250_000,
    });
    expect(result.subtotalKobo).toBe(2_400_000);
    expect(result.deliveryFeeKobo).toBe(250_000);
    expect(result.totalKobo).toBe(2_650_000);
    expect(formatNaira(result.totalKobo)).toBe("NGN 26,500");
  });

  it("sums multiple lines and applies a discount", () => {
    const result = calculateOrderTotal({
      items: [
        { unitPriceKobo: 1_200_000, quantity: 3 },
        { unitPriceKobo: 850_000, quantity: 1 },
      ],
      deliveryFeeKobo: 250_000,
      discountKobo: 100_000,
    });
    expect(result.totalKobo).toBe(3_600_000 + 850_000 + 250_000 - 100_000);
  });

  it("rejects an empty order", () => {
    expect(() => calculateOrderTotal({ items: [] })).toThrow(MoneyError);
  });

  it("rejects negative prices", () => {
    expect(() =>
      calculateOrderTotal({ items: [{ unitPriceKobo: -100, quantity: 1 }] })
    ).toThrow(MoneyError);
  });

  it("rejects non-integer kobo (floats never enter money math)", () => {
    expect(() =>
      calculateOrderTotal({ items: [{ unitPriceKobo: 100.5, quantity: 1 }] })
    ).toThrow(MoneyError);
  });

  it("rejects zero, negative, fractional and oversized quantities", () => {
    for (const quantity of [0, -1, 1.5, 1000]) {
      expect(() =>
        calculateOrderTotal({ items: [{ unitPriceKobo: 100, quantity }] })
      ).toThrow(MoneyError);
    }
  });

  it("rejects unsafe integer totals", () => {
    expect(() =>
      calculateOrderTotal({
        items: [{ unitPriceKobo: Number.MAX_SAFE_INTEGER, quantity: 999 }],
      })
    ).toThrow(MoneyError);
  });

  it("rejects a mismatched line total", () => {
    expect(() =>
      calculateOrderTotal({
        items: [
          { unitPriceKobo: 1_200_000, quantity: 2, lineTotalKobo: 999 },
        ],
      })
    ).toThrow(/does not match/);
  });

  it("rejects a discount larger than the order value", () => {
    expect(() =>
      calculateOrderTotal({
        items: [{ unitPriceKobo: 1000, quantity: 1 }],
        discountKobo: 5000,
      })
    ).toThrow(/discount/);
  });
});

describe("provider-boundary conversion", () => {
  it("converts kobo to naira only at the boundary", () => {
    expect(koboToNairaAmount(2_650_000)).toBe(26_500);
    expect(koboToNairaAmount(0)).toBe(0);
  });

  it("converts provider naira amounts (number or string) back to kobo", () => {
    expect(nairaAmountToKobo(26_500)).toBe(2_650_000);
    expect(nairaAmountToKobo("26500.00")).toBe(2_650_000);
    expect(nairaAmountToKobo("26500.5")).toBe(2_650_050);
  });

  it("rejects invalid provider amounts", () => {
    expect(() => nairaAmountToKobo("not-a-number")).toThrow(MoneyError);
    expect(() => nairaAmountToKobo(-5)).toThrow(MoneyError);
  });
});

describe("formatNaira", () => {
  it("formats whole and fractional naira", () => {
    expect(formatNaira(2_650_000)).toBe("NGN 26,500");
    expect(formatNaira(1_250)).toBe("NGN 12.50");
    expect(formatNaira(0)).toBe("NGN 0");
  });
});
