import type { MultiPolygon } from "geojson";

/**
 * Prague's parking areas, from VPH, the city's official parking map (vph.zpspraha.cz): each
 * district's area ("oblast", e.g. "5") and, in some districts, its smaller sub-areas
 * ("podoblast", e.g. "5.1"). A resident's or business's parking permit is issued for one of
 * them and covers its blue and purple sections. Neighbouring areas overlap along the
 * streets on their border, where a section counts for both.
 *
 * The map's API asks for HTTP basic auth: the fixed credentials the public map's own script
 * sends for every visitor.
 */
const AREAS_URL = "https://vph.zpspraha.cz/api/v1/parking/area?category=PARKING";
const PUBLIC_MAP_CREDENTIALS = "test:test";

// The whole city, for the city-wide permit for zero-emission cars, which the app doesn't offer.
const CITY_WIDE = "TS_Praha";

const AREA_NAME = /^\d+(\.\d+)?$/;
const SECTION_DISTRICT = /^P(\d+)-/;

/** An area as the API sends it. A MULTIPOLYGON lists its rings one after another. */
export interface VphArea {
  name: string;
  shape: { type: string; point: { lng: string; lat: string }[] };
}

export interface ParkingArea {
  name: string;
  rings: [number, number][][];
}

/**
 * Splits an area's flat point list into rings: each ring ends where it comes back to its
 * own first point. A point repeating the one before it adds nothing, and some areas have
 * them, including a doubled closing point.
 */
function ringsOf(area: VphArea): [number, number][][] {
  const rings: [number, number][][] = [];
  let ring: [number, number][] = [];
  let previous: [number, number] | null = null;
  for (const p of area.shape.point) {
    const point: [number, number] = [Number(p.lng), Number(p.lat)];
    if (previous && point[0] === previous[0] && point[1] === previous[1]) continue;
    previous = point;
    ring.push(point);
    if (ring.length > 3 && point[0] === ring[0][0] && point[1] === ring[0][1]) {
      rings.push(ring);
      ring = [];
    }
  }
  if (ring.length > 0) throw new Error(`VPH area ${area.name}: a ring doesn't close`);
  return rings;
}

/**
 * The districts and sub-areas from the API's answer. Throws on anything unexpected, so a
 * change on VPH's side stops the build rather than quietly dropping permits.
 */
export function parseAreas(json: unknown): ParkingArea[] {
  if (!Array.isArray(json)) throw new Error("VPH areas: expected a list");
  const areas = (json as VphArea[])
    .filter((a) => a.name !== CITY_WIDE)
    .map((a) => {
      if (!AREA_NAME.test(a.name)) throw new Error(`VPH areas: unexpected name "${a.name}"`);
      const rings = ringsOf(a);
      if (rings.length === 0) throw new Error(`VPH area ${a.name}: no shape`);
      return { name: a.name, rings };
    });
  if (!areas.some((a) => !a.name.includes("."))) throw new Error("VPH areas: no districts");
  return areas.sort((a, b) => compareAreas(a.name, b.name));
}

/** Districts in number order, each followed by its own sub-areas. */
export function compareAreas(a: string, b: string): number {
  const [da, sa = 0] = a.split(".").map(Number);
  const [db, sb = 0] = b.split(".").map(Number);
  return da - db || sa - sb;
}

/** Whether a point lies inside rings, counting crossings so a hole isn't inside. */
export function isInside([x, y]: [number, number], rings: [number, number][][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** The mean of a section's outer-ring corners, which lies inside a narrow curbside strip. */
function centreOf(geometry: MultiPolygon): [number, number] {
  const corners = geometry.coordinates.flatMap((polygon) => polygon[0]);
  const sum = corners.reduce(([x, y], [cx, cy]) => [x + cx, y + cy], [0, 0]);
  return [sum[0] / corners.length, sum[1] / corners.length];
}

/**
 * The areas a zone section belongs to: every area whose shape holds its centre. A section
 * outside every district's shape counts in the district its code names; `onFallback` hears
 * about each one.
 *
 * @example areasOfSection("P5-1117", geometry, areas) -> ["5", "5.1", "5.3"]
 */
export function areasOfSection(
  code: string,
  geometry: MultiPolygon,
  areas: ParkingArea[],
  onFallback: (code: string) => void = () => {},
): string[] {
  const centre = centreOf(geometry);
  const names = areas.filter((a) => isInside(centre, a.rings)).map((a) => a.name);
  const district = SECTION_DISTRICT.exec(code)?.[1];
  if (district && !names.some((n) => !n.includes("."))) {
    onFallback(code);
    names.push(district);
  }
  return names.sort(compareAreas);
}

export async function fetchParkingAreas(): Promise<ParkingArea[]> {
  const res = await fetch(AREAS_URL, {
    headers: { Authorization: `Basic ${Buffer.from(PUBLIC_MAP_CREDENTIALS).toString("base64")}` },
  });
  if (!res.ok) throw new Error(`VPH areas fetch failed (${res.status}): ${AREAS_URL}`);
  return parseAreas(await res.json());
}
