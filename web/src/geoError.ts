/** What to do about a GeolocationPositionError. */
export type GeoErrorAction =
  /** Permanent - the user has to change a setting before this can ever work. */
  | "denied"
  /** Transient, and we already have a position: keep showing it. */
  | "keep"
  /** Transient, and we have nothing yet: keep waiting for the watch to deliver a fix. */
  | "wait";

// Numeric codes from the W3C GeolocationPositionError interface. Hardcoded rather than
// read off the error object because the constants live on the instance, and error objects
// synthesized in tests (or by odd browsers) don't always carry them.
const PERMISSION_DENIED = 1;

/**
 * Classifies a geolocation error. POSITION_UNAVAILABLE (2) and TIMEOUT (3) are transient -
 * on iOS the former surfaces as the famously unhelpful "kCLErrorDomain error 0", which
 * just means "no fix yet" (indoors, no GPS lock) and typically resolves on its own, since
 * watchPosition stays active and keeps trying. Only PERMISSION_DENIED is terminal.
 *
 * @example classifyGeoError(1, false) -> "denied"
 * @example classifyGeoError(2, true) -> "keep"
 * @example classifyGeoError(2, false) -> "wait"
 */
export function classifyGeoError(code: number, hasFix: boolean): GeoErrorAction {
  if (code === PERMISSION_DENIED) return "denied";
  return hasFix ? "keep" : "wait";
}
