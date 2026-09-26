/**
 * What the user is driving. A car from a carsharing service registered with the city holds
 * a permit for every blue and purple zone in Prague, which covers it while it waits between
 * rentals - so for a shared car the question is where the rental can end.
 */
export type Vehicle = "own" | "shared";

export const VEHICLE_LABEL: Record<Vehicle, string> = {
  own: "Own car",
  shared: "Shared car",
};

const STORAGE_KEY = "caniparkhere.vehicle";

/** The vehicle picked last time, or "own" when nothing usable is stored. Storage can be
 * blocked (private windows, some embedded views), which counts as nothing stored. */
export function loadVehicle(): Vehicle {
  try {
    return localStorage.getItem(STORAGE_KEY) === "shared" ? "shared" : "own";
  } catch {
    return "own";
  }
}

export function saveVehicle(vehicle: Vehicle): void {
  try {
    localStorage.setItem(STORAGE_KEY, vehicle);
  } catch {
    // The pick still applies for this session.
  }
}
