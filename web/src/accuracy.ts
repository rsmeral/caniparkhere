// The accuracy each signal bar stands for, best first: at most 10m is four bars, down to
// one bar past 50m. 10m is the smallest circle the lookup uses.
const BAR_LIMITS_METERS = [10, 25, 50];

/** @example accuracyBars(8) -> 4; accuracyBars(30) -> 2; accuracyBars(120) -> 1 */
export function accuracyBars(accuracyMeters: number): number {
  return 4 - BAR_LIMITS_METERS.filter((limit) => accuracyMeters > limit).length;
}
