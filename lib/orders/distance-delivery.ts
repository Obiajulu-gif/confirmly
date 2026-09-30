/**
 * Distance-based delivery pricing.
 *
 * A merchant opts in by setting their store location, a base fee and a
 * per-km rate (optionally a maximum distance). A customer's shared WhatsApp
 * location pin is then priced as:
 *
 *   fee = base + perKm * ceil(straight-line km)
 *
 * Straight-line ("as the crow flies") distance is always shorter than the
 * road distance; merchants set their per-km rate with that in mind. All money
 * is integer kobo, computed server-side — never taken from the chat.
 */

/** Sentinel stored as the draft/flow "zone id" when delivery is priced by distance. */
export const DISTANCE_ZONE_ID = "DISTANCE";

/** A shared pin older than this is not reused silently for pricing. */
export const PIN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface DistancePricing {
  storeLatitude: number | null;
  storeLongitude: number | null;
  deliveryBaseFeeKobo: number | null;
  deliveryPerKmKobo: number | null;
  deliveryMaxKm: number | null;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export type DistanceQuote =
  | { ok: true; km: number; billableKm: number; feeKobo: number }
  | { ok: false; reason: "not_configured" | "out_of_range" | "invalid_point"; km?: number };

const EARTH_RADIUS_KM = 6371;

export function isValidPoint(p: Partial<GeoPoint> | null | undefined): p is GeoPoint {
  return (
    !!p &&
    typeof p.latitude === "number" &&
    typeof p.longitude === "number" &&
    Number.isFinite(p.latitude) &&
    Number.isFinite(p.longitude) &&
    Math.abs(p.latitude) <= 90 &&
    Math.abs(p.longitude) <= 180
  );
}

/** Great-circle distance in km (haversine). */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isDistancePricingEnabled(m: DistancePricing): boolean {
  return (
    isValidPoint({ latitude: m.storeLatitude ?? undefined, longitude: m.storeLongitude ?? undefined }) &&
    m.deliveryBaseFeeKobo != null &&
    m.deliveryBaseFeeKobo >= 0 &&
    m.deliveryPerKmKobo != null &&
    m.deliveryPerKmKobo >= 0
  );
}

export function quoteDistanceDelivery(merchant: DistancePricing, to: Partial<GeoPoint> | null): DistanceQuote {
  if (!isDistancePricingEnabled(merchant)) return { ok: false, reason: "not_configured" };
  if (!isValidPoint(to)) return { ok: false, reason: "invalid_point" };
  const km = haversineKm({ latitude: merchant.storeLatitude!, longitude: merchant.storeLongitude! }, to);
  const rounded = Math.round(km * 10) / 10;
  if (merchant.deliveryMaxKm != null && merchant.deliveryMaxKm > 0 && km > merchant.deliveryMaxKm) {
    return { ok: false, reason: "out_of_range", km: rounded };
  }
  const billableKm = Math.max(1, Math.ceil(km));
  const feeKobo = merchant.deliveryBaseFeeKobo! + merchant.deliveryPerKmKobo! * billableKm;
  return { ok: true, km: rounded, billableKm, feeKobo };
}

/** The customer's last shared pin, if recent enough to price from. */
export function recentPin(
  customer: {
    lastLatitude: number | null;
    lastLongitude: number | null;
    lastLocationLabel?: string | null;
    lastLocationAt: Date | null;
  } | null,
  now = new Date()
): (GeoPoint & { label: string | null }) | null {
  if (!customer?.lastLocationAt) return null;
  if (now.getTime() - customer.lastLocationAt.getTime() > PIN_MAX_AGE_MS) return null;
  const point = { latitude: customer.lastLatitude ?? NaN, longitude: customer.lastLongitude ?? NaN };
  return isValidPoint(point) ? { ...point, label: customer.lastLocationLabel ?? null } : null;
}

/** Short human label, e.g. "Shared location (6.4 km)". */
export function distanceZoneLabel(km: number): string {
  return `Shared location (${km.toFixed(1)} km)`;
}

/**
 * Parses coordinates the merchant pastes: "6.5244, 3.3792", or a Google/Apple
 * Maps link containing "@6.5244,3.3792", "q=6.5244,3.3792" or "ll=…".
 */
export function parseCoordinates(input: string): GeoPoint | null {
  const text = decodeURIComponent(input.trim());
  const patterns = [
    /@(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/,
    /[?&](?:q|ll|query|destination)=(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/,
    /^(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const point = { latitude: Number(m[1]), longitude: Number(m[2]) };
      if (isValidPoint(point)) return point;
    }
  }
  return null;
}
