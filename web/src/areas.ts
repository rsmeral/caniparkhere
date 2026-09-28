/** Parking areas in order: districts by number, each followed by its own sub-areas, so
 * "9" < "10" < "10.1" < "10.2". */
export function compareAreas(a: string, b: string): number {
  const [da, sa = 0] = a.split(".").map(Number);
  const [db, sb = 0] = b.split(".").map(Number);
  return da - db || sa - sb;
}
