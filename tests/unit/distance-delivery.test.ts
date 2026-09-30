import { describe, expect, it } from "vitest";
import {
  haversineKm,
  isDistancePricingEnabled,
  parseCoordinates,
  PIN_MAX_AGE_MS,
  quoteDistanceDelivery,
  recentPin,
} from "@/lib/orders/distance-delivery";

// Yaba (store) and Lekki Phase 1 (customer), Lagos — roughly 12 km apart.
const YABA = { latitude: 6.5095, longitude: 3.3711 };
const LEKKI = { latitude: 6.4474, longitude: 3.4723 };

const merchant = {
  storeLatitude: YABA.latitude,
  storeLongitude: YABA.longitude,
  deliveryBaseFeeKobo: 100_000, // ₦1,000
  deliveryPerKmKobo: 15_000, // ₦150/km
  deliveryMaxKm: null as number | null,
};

describe("haversineKm", () => {
  it("is zero for the same point and symmetric", () => {
    expect(haversineKm(YABA, YABA)).toBe(0);
    expect(haversineKm(YABA, LEKKI)).toBeCloseTo(haversineKm(LEKKI, YABA), 9);
  });

  it("measures a known Lagos distance", () => {
    const km = haversineKm(YABA, LEKKI);
    expect(km).toBeGreaterThan(12);
    expect(km).toBeLessThan(14);
  });
});

describe("quoteDistanceDelivery", () => {
  it("charges base + per-km for each started km, in kobo", () => {
    const quote = quoteDistanceDelivery(merchant, LEKKI);
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.billableKm).toBe(Math.ceil(haversineKm(YABA, LEKKI)));
    expect(quote.feeKobo).toBe(100_000 + 15_000 * quote.billableKm);
    expect(Number.isInteger(quote.feeKobo)).toBe(true);
  });

  it("bills at least one km for very short trips", () => {
    const nextDoor = { latitude: YABA.latitude + 0.0005, longitude: YABA.longitude };
    const quote = quoteDistanceDelivery(merchant, nextDoor);
    expect(quote).toMatchObject({ ok: true, billableKm: 1, feeKobo: 115_000 });
  });

  it("refuses pins beyond the maximum distance", () => {
    const quote = quoteDistanceDelivery({ ...merchant, deliveryMaxKm: 5 }, LEKKI);
    expect(quote).toMatchObject({ ok: false, reason: "out_of_range" });
  });

  it("is off until location, base fee and rate are all set", () => {
    expect(isDistancePricingEnabled(merchant)).toBe(true);
    expect(isDistancePricingEnabled({ ...merchant, deliveryPerKmKobo: null })).toBe(false);
    expect(isDistancePricingEnabled({ ...merchant, storeLatitude: null })).toBe(false);
    expect(quoteDistanceDelivery({ ...merchant, deliveryBaseFeeKobo: null }, LEKKI)).toEqual({
      ok: false,
      reason: "not_configured",
    });
  });

  it("rejects invalid pins", () => {
    expect(quoteDistanceDelivery(merchant, { latitude: 200, longitude: 3 })).toEqual({
      ok: false,
      reason: "invalid_point",
    });
    expect(quoteDistanceDelivery(merchant, null)).toMatchObject({ ok: false, reason: "invalid_point" });
  });
});

describe("recentPin", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const customer = {
    lastLatitude: LEKKI.latitude,
    lastLongitude: LEKKI.longitude,
    lastLocationLabel: "Admiralty Way",
    lastLocationAt: new Date(now.getTime() - 60_000),
  };

  it("returns a fresh pin with its label", () => {
    expect(recentPin(customer, now)).toEqual({ ...LEKKI, label: "Admiralty Way" });
  });

  it("ignores stale or missing pins", () => {
    expect(recentPin({ ...customer, lastLocationAt: new Date(now.getTime() - PIN_MAX_AGE_MS - 1) }, now)).toBeNull();
    expect(recentPin({ ...customer, lastLocationAt: null }, now)).toBeNull();
    expect(recentPin(null, now)).toBeNull();
  });
});

describe("parseCoordinates", () => {
  it.each([
    ["6.5244, 3.3792", 6.5244, 3.3792],
    ["6.5244 3.3792", 6.5244, 3.3792],
    ["https://www.google.com/maps/@6.5244,3.3792,15z", 6.5244, 3.3792],
    ["https://maps.google.com/?q=6.5244,3.3792", 6.5244, 3.3792],
    ["https://maps.apple.com/?ll=-1.2921,36.8219", -1.2921, 36.8219],
  ])("parses %s", (input, lat, lng) => {
    expect(parseCoordinates(input)).toEqual({ latitude: lat, longitude: lng });
  });

  it("rejects text without usable coordinates", () => {
    expect(parseCoordinates("12 Admiralty Way, Lekki")).toBeNull();
    expect(parseCoordinates("95.1, 3.3")).toBeNull();
  });
});
