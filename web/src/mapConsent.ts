/**
 * Whether the user has agreed to load the map. Its streets come from OpenFreeMap's servers,
 * which see which part of the map is asked for, so the map loads only once the user accepts.
 */
const STORAGE_KEY = "caniparkhere.map";

/** Whether the user agreed before. Blocked storage counts as not yet. */
export function loadMapConsent(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "accepted";
  } catch {
    return false;
  }
}

export function saveMapConsent(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "accepted");
  } catch {
    // The answer still applies for this session.
  }
}

const OPENED_KEY = "caniparkhere.mapOpened";

/** Whether the map has been opened before, after which its handle no longer nudges. */
export function loadMapOpened(): boolean {
  try {
    return localStorage.getItem(OPENED_KEY) === "yes";
  } catch {
    return false;
  }
}

export function saveMapOpened(): void {
  try {
    localStorage.setItem(OPENED_KEY, "yes");
  } catch {
    // The handle stops nudging for this session anyway.
  }
}
