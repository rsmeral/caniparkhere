/**
 * The parking areas the user's permits are for, e.g. ["5", "8.1"]: a whole district, or one
 * of the smaller sub-areas some districts have. A car can hold several permits.
 */
const STORAGE_KEY = "caniparkhere.permits";

/** The permits saved last time, or none when nothing usable is stored or storage is blocked. */
export function loadPermits(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((a): a is string => typeof a === "string") : [];
  } catch {
    return [];
  }
}

export function savePermits(areas: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(areas));
  } catch {
    // The permits still apply for this session.
  }
}
