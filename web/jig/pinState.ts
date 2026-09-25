export interface Pin {
  lon: number;
  lat: number;
  accuracyMeters: number;
}

/** Vinohrady, inside a paid zone, with a typical phone GPS accuracy. */
export const DEFAULT_PIN: Pin = { lon: 14.4378, lat: 50.0755, accuracyMeters: 20 };

/**
 * The pin is kept in the URL hash as `#lat,lon,accuracy`, so a spot can be bookmarked,
 * shared, or survive a reload. Five decimals is about a metre.
 *
 * @example formatPinHash({ lon: 14.4378, lat: 50.0755, accuracyMeters: 20 }) -> "#50.07550,14.43780,20"
 */
export function formatPinHash(pin: Pin): string {
  return `#${pin.lat.toFixed(5)},${pin.lon.toFixed(5)},${Math.round(pin.accuracyMeters)}`;
}

/** @example parsePinHash("#50.0755,14.4378,20") -> { lon: 14.4378, lat: 50.0755, accuracyMeters: 20 } */
export function parsePinHash(hash: string): Pin | null {
  const parts = hash.replace(/^#/, "").split(",").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [lat, lon, accuracyMeters] = parts;
  return { lon, lat, accuracyMeters };
}
