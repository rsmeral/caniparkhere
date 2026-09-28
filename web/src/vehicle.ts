/**
 * What the user is driving. An own car with a parking permit parks freely in the blue and
 * purple zones of the areas its permits are for (see permits.ts). A car from a carsharing
 * service registered with the city holds a permit for every blue and purple zone in Prague,
 * which covers it while it waits between rentals - so for a shared car the question is
 * where the rental can end. A motorbike parks in every zone for free.
 */
export type Vehicle = "own" | "permit" | "shared" | "motorbike";

export const VEHICLE_LABEL: Record<Vehicle, string> = {
  own: "Own car",
  permit: "Own car + permit",
  shared: "Shared car",
  motorbike: "Motorbike",
};

const isVehicle = (value: string | null): value is Vehicle =>
  value !== null && Object.hasOwn(VEHICLE_LABEL, value);

const STORAGE_KEY = "caniparkhere.vehicle";

/** The vehicle picked last time, or "own" when nothing usable is stored. Storage can be
 * blocked (private windows, some embedded views), which counts as nothing stored. */
export function loadVehicle(): Vehicle {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isVehicle(stored) ? stored : "own";
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
