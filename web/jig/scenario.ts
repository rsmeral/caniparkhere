export interface Pin {
  lon: number;
  lat: number;
  accuracyMeters: number;
}

/**
 * What the jig puts in front of the app: where, and when. `time` is a local
 * `YYYY-MM-DDTHH:MM`, the format of a datetime-local input, or null for the real time.
 */
export interface Scenario {
  pin: Pin;
  time: string | null;
}

/** Vinohrady, inside a paid zone, with a typical phone GPS accuracy, at the real time. */
export const DEFAULT_SCENARIO: Scenario = {
  pin: { lon: 14.4378, lat: 50.0755, accuracyMeters: 20 },
  time: null,
};

const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * The scenario is kept in the URL hash as `#lat,lon,accuracy` with an optional `,time`, so
 * it can be bookmarked, shared, or survive a reload. Five decimals is about a metre.
 *
 * @example formatScenarioHash({ pin: { lon: 14.4378, lat: 50.0755, accuracyMeters: 20 }, time: null }) -> "#50.07550,14.43780,20"
 * @example formatScenarioHash({ pin: { lon: 14.4378, lat: 50.0755, accuracyMeters: 20 }, time: "2026-09-26T21:30" }) -> "#50.07550,14.43780,20,2026-09-26T21:30"
 */
export function formatScenarioHash({ pin, time }: Scenario): string {
  const place = `${pin.lat.toFixed(5)},${pin.lon.toFixed(5)},${Math.round(pin.accuracyMeters)}`;
  return `#${place}${time === null ? "" : `,${time}`}`;
}

/** @example parseScenarioHash("#50.0755,14.4378,20") -> { pin: { lon: 14.4378, lat: 50.0755, accuracyMeters: 20 }, time: null } */
export function parseScenarioHash(hash: string): Scenario | null {
  const [latText, lonText, accuracyText, time = null, ...rest] = hash.replace(/^#/, "").split(",");
  const [lat, lon, accuracyMeters] = [latText, lonText, accuracyText].map(Number);
  if (rest.length > 0 || [lat, lon, accuracyMeters].some((n) => !Number.isFinite(n))) return null;
  if (time !== null && (!LOCAL_TIME.test(time) || Number.isNaN(Date.parse(time)))) return null;
  return { pin: { lon, lat, accuracyMeters }, time };
}

/** A Date as a local `YYYY-MM-DDTHH:MM`, the format of a datetime-local input. */
export function toLocalTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Moves a local `YYYY-MM-DDTHH:MM` by a number of minutes, across days and DST changes. */
export function shiftLocalTime(time: string, minutes: number): string {
  return toLocalTime(new Date(new Date(time).getTime() + minutes * 60_000));
}
