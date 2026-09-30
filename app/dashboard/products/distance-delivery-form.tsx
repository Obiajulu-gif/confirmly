"use client";

import { useActionState, useState } from "react";
import { LocateFixed } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { saveDistanceDeliveryAction, type DistanceDeliveryState } from "./actions";

const initial: DistanceDeliveryState = { error: null, ok: false };

/**
 * Distance pricing settings: store location, base fee, per-km rate and an
 * optional maximum distance. Customers who share a WhatsApp location pin are
 * then quoted base + rate × km automatically.
 */
export function DistanceDeliveryForm({
  current,
}: {
  current: {
    latitude: number | null;
    longitude: number | null;
    baseFeeNaira: number | null;
    perKmNaira: number | null;
    maxKm: number | null;
    enabled: boolean;
  };
}) {
  const [state, action, pending] = useActionState(saveDistanceDeliveryAction, initial);
  const [location, setLocation] = useState(
    current.latitude != null && current.longitude != null
      ? `${current.latitude.toFixed(6)}, ${current.longitude.toFixed(6)}`
      : ""
  );
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  function useCurrentLocation() {
    if (!("geolocation" in navigator)) {
      setGeoError("This browser can't share its location. Paste coordinates instead.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
        setLocating(false);
      },
      () => {
        setGeoError("Couldn't get your location. Allow location access, or paste coordinates.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 }
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <Input
          id="distance-location"
          name="location"
          label="Store location (where deliveries start)"
          placeholder="6.5244, 3.3792 or a Google Maps link"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={useCurrentLocation} disabled={locating}>
            <LocateFixed className="h-4 w-4" aria-hidden />
            {locating ? "Locating…" : "Use my current location"}
          </Button>
          {location && /^-?\d/.test(location) ? (
            <a
              href={`https://www.google.com/maps?q=${encodeURIComponent(location)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Check on map
            </a>
          ) : null}
        </div>
        {geoError ? <p className="mt-1.5 text-sm text-red-700">{geoError}</p> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          name="baseFeeNaira"
          type="number"
          min={0}
          step="1"
          label="Base fee (NGN)"
          required
          defaultValue={current.baseFeeNaira ?? ""}
          placeholder="1000"
        />
        <Input
          name="perKmNaira"
          type="number"
          min={0}
          step="1"
          label="Per km (NGN)"
          required
          defaultValue={current.perKmNaira ?? ""}
          placeholder="150"
        />
        <Input
          name="maxKm"
          type="number"
          min={0.5}
          step="0.5"
          label="Max distance (km, optional)"
          defaultValue={current.maxKm ?? ""}
          placeholder="25"
        />
      </div>
      <p className="text-xs text-ink-500">
        Fee = base + per-km × distance, rounded up to the next whole km. Distance is measured in a
        straight line, so roads add a little — set your per-km rate with that in mind.
      </p>

      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-emerald-700" role="status">
          Delivery settings saved.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : current.enabled ? "Save changes" : "Turn on distance pricing"}
        </Button>
        {current.enabled ? (
          <Button
            type="submit"
            name="intent"
            value="disable"
            variant="secondary"
            formNoValidate
            disabled={pending}
          >
            Turn off
          </Button>
        ) : null}
      </div>
    </form>
  );
}
