/**
 * Whether the user has agreed to load the map. Its streets come from OpenFreeMap's servers,
 * which see which part of the map is asked for, so the map loads only once the user accepts.
 * "declined" keeps it from opening by itself; the map button still offers it.
 */
export type MapConsent = "accepted" | "declined" | null;

const STORAGE_KEY = "caniparkhere.map";

/** The answer given last time, or null when there's none or storage is blocked. */
export function loadMapConsent(): MapConsent {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "accepted" || stored === "declined" ? stored : null;
  } catch {
    return null;
  }
}

export function saveMapConsent(consent: Exclude<MapConsent, null>): void {
  try {
    localStorage.setItem(STORAGE_KEY, consent);
  } catch {
    // The answer still applies for this session.
  }
}
