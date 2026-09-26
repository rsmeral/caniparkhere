import type { LoadedData } from "./dataStore";
import { isPublicHoliday } from "./holidays";
import { LineIndex, PolygonIndex } from "./spatialIndex";
import { activeRuleNow } from "./tariffLogic";
import type { Bounds, Tariff, TariffRule, ZpsProps } from "./types";

/** The matched parking zone's own identity - shown as a lower-priority "here's what we
 * detected" line so the recommendation is checkable against what's painted on the curb. */
export interface ZoneInfo {
  code: string;
  category: ZpsProps["category"];
}

/** A zone's rules at the moment asked about. */
export type ZoneStatus =
  | ({
      kind: "paidZone";
      pricePerHour: number;
      dailyCapCzk: number | null;
      /** The longest a visitor may stay, in minutes, when the zone limits it and it's known. */
      maxStayMinutes: number | null;
      from: string;
      until: string;
    } & ZoneInfo)
  | ({ kind: "residentZone" } & ZoneInfo)
  | ({ kind: "freeZoneRightNow" } & ZoneInfo);

/** Street cleaning on a place: today, and the soonest date within the warning window. */
export interface Cleaning {
  today: boolean;
  upcoming: { date: string; daysUntil: number } | null;
}

/**
 * One place the fix could be: a zone the accuracy circle reaches, or a street it reaches with
 * no zone to go by. Each carries the street it's on and any street cleaning there.
 */
export interface Place {
  zone: ZoneStatus | null;
  streetName: string | null;
  cleaning: Cleaning;
  /** From the fix to the place, 0 when the fix is inside it. */
  distanceMeters: number;
}

export type QueryResult = { kind: "outOfArea" } | { kind: "places"; places: Place[] };

/**
 * Checks a point against the data's coverage envelope (see the pipeline's padBbox) - a
 * coarse "are you anywhere near Prague" sanity check, not a precise city-boundary test.
 */
export function isWithinBounds(bounds: Bounds, lon: number, lat: number): boolean {
  return (
    lon >= bounds.minLon && lon <= bounds.maxLon && lat >= bounds.minLat && lat <= bounds.maxLat
  );
}

export interface Indexes {
  zps: PolygonIndex<LoadedData["zps"]["features"][number]["properties"]>;
  letni: PolygonIndex<LoadedData["letni"]["features"][number]["properties"]>;
  streets: LineIndex<LoadedData["streets"]["features"][number]["properties"]>;
  /** RÚIAN's own spelling of each street name, by its lowercase form. */
  streetNames: Map<string, string>;
}

// How far ahead to warn about upcoming street cleaning.
export const WARNING_WINDOW_DAYS = 5;

// The accuracy circle's radius is kept within these. Below the minimum, a precise fix in the
// roadway would miss the zones along the curb; past the maximum, city blocks and unrelated
// streets fall inside the circle too.
const MIN_RADIUS_METERS = 10;
const MAX_RADIUS_METERS = 100;

// The least distance at which a RÚIAN street centerline still counts as "this street". A
// centerline has no width, so a car at the curb of a wide street sits well off it even with
// a precise fix.
const STREET_MATCH_RADIUS_METERS = 25;

// How far from a place a street centerline can be and still name the street it's on. Some
// zones are whole parking areas set back inside a block; every zone in the data has a
// centerline within 75m.
const PLACE_STREET_RADIUS_METERS = 100;

/** Builds the R-tree indexes for a loaded dataset; do this once per data load, not per query. */
export function buildIndexes(data: LoadedData): Indexes {
  return {
    zps: new PolygonIndex(data.zps.features),
    letni: new PolygonIndex(data.letni.features),
    streets: new LineIndex(data.streets.features),
    streetNames: new Map(data.streets.names.map((name) => [name.toLowerCase(), name])),
  };
}

/**
 * Formats a Date as a local (not UTC) YYYY-MM-DD, to match activeRuleNow's use of local
 * getDay()/getHours() - using toISOString() here would misjudge "today" for a couple of
 * hours after local midnight in any timezone ahead of UTC (Prague always is).
 */
function toLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** @example daysBetween("2026-04-05", "2026-04-07") -> 2 */
function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.parse(`${fromISO}T00:00:00Z`);
  const b = Date.parse(`${toISO}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Names the RÚIAN street centerline nearest the point, within radiusMeters. */
function streetNameNear(
  data: LoadedData,
  indexes: Indexes,
  [lon, lat]: [number, number],
  radiusMeters: number,
): string | null {
  const feature = indexes.streets.findNearest(lon, lat, radiusMeters);
  if (!feature || feature.properties.nameId === null) return null;
  return data.streets.names[feature.properties.nameId];
}

/** A rule's daily cap, lowered to the tariff's holiday cap on a public holiday. */
function capAt(tariff: Tariff, rule: TariffRule, now: Date): number | null {
  if (tariff.holidayCapCzk === null || !isPublicHoliday(now)) return rule.dailyCapCzk;
  return Math.min(rule.dailyCapCzk ?? Infinity, tariff.holidayCapCzk);
}

/**
 * A zps feature's rules at `now`. Every category is paid while its tariff is running and
 * free for anyone outside those hours - a resident (blue) zone's tariff is what a visitor
 * pays for a short stay. A resident zone with no tariff has no visitor parking to report.
 */
function zoneStatusOf(
  data: LoadedData,
  feature: LoadedData["zps"]["features"][number],
  now: Date,
): ZoneStatus {
  const zone: ZoneInfo = { code: feature.properties.code, category: feature.properties.category };
  if (feature.properties.category === "RES" && feature.properties.tariffId === null) {
    return { kind: "residentZone", ...zone };
  }
  if (feature.properties.tariffId !== null) {
    const tariff = data.zps.tariffs[feature.properties.tariffId];
    const rule = activeRuleNow(tariff, now);
    if (rule) {
      return {
        kind: "paidZone",
        pricePerHour: rule.pricePerHour,
        dailyCapCzk: capAt(tariff, rule, now),
        maxStayMinutes: feature.properties.maxStayMinutes ?? null,
        from: rule.start,
        until: rule.end,
        ...zone,
      };
    }
  }
  return { kind: "freeZoneRightNow", ...zone };
}

const NO_CLEANING: Cleaning = { today: false, upcoming: null };

/** A cleaning section's cleaning today and within the warning window. */
function cleaningOf(dates: string[], today: string, everywhereToday: boolean): Cleaning {
  let upcoming: Cleaning["upcoming"] = null;
  for (const date of dates) {
    const daysUntil = daysBetween(today, date);
    if (
      daysUntil > 0 &&
      daysUntil <= WARNING_WINDOW_DAYS &&
      (!upcoming || daysUntil < upcoming.daysUntil)
    ) {
      upcoming = { date, daysUntil };
    }
  }
  return { today: everywhereToday || dates.includes(today), upcoming };
}

/** Both kinds of cleaning a place has from more than one section: today if any is, and the
 * soonest date ahead. */
function mergeCleaning(a: Cleaning, b: Cleaning): Cleaning {
  const upcoming =
    !a.upcoming || (b.upcoming && b.upcoming.daysUntil < a.upcoming.daysUntil)
      ? b.upcoming
      : a.upcoming;
  return { today: a.today || b.today, upcoming };
}

/**
 * Every place the fix could be, nearest first. The fix is a circle: its accuracy radius, kept
 * between MIN_RADIUS_METERS and MAX_RADIUS_METERS. Zones and street-cleaning sections count
 * when the circle reaches them, and the fix being inside one is just the case of distance 0.
 *
 * - Each zone code the circle reaches is a place, named by the street nearest the zone's
 *   point closest to the fix. A zone code often spans several streets, so which street
 *   depends on the part of the zone in play.
 * - Each cleaning section the circle reaches belongs to the places on its street. A section
 *   on a street with no such place is a place of its own, so cleaning is never dropped.
 * - With neither in reach, the one place is the street nearest the fix, if any.
 *
 * cleaningEverywhereToday treats every street-cleaning section as being cleaned today,
 * whatever its dates. It exists for simulating a closure in the jig.
 */
export function queryPlaces(
  data: LoadedData,
  indexes: Indexes,
  lon: number,
  lat: number,
  now = new Date(),
  accuracyMeters: number | null = null,
  cleaningEverywhereToday = false,
): Place[] {
  const radius = Math.min(Math.max(accuracyMeters ?? 0, MIN_RADIUS_METERS), MAX_RADIUS_METERS);
  const today = toLocalISODate(now);

  const places: Place[] = [];
  const seenCodes = new Set<string>();
  for (const match of indexes.zps.findNearby(lon, lat, radius)) {
    if (seenCodes.has(match.feature.properties.code)) continue;
    seenCodes.add(match.feature.properties.code);
    places.push({
      zone: zoneStatusOf(data, match.feature, now),
      streetName: streetNameNear(data, indexes, match.point, PLACE_STREET_RADIUS_METERS),
      cleaning: NO_CLEANING,
      distanceMeters: match.distanceMeters,
    });
  }

  for (const match of indexes.letni.findNearby(lon, lat, radius)) {
    const { name, datesId } = match.feature.properties;
    const cleaning = cleaningOf(
      datesId !== null ? data.letni.dates[datesId] : [],
      today,
      cleaningEverywhereToday,
    );
    // The section's own name, in RÚIAN's spelling. Some sections carry a placeholder code
    // rather than a name, and take the street they're on instead.
    const streetName =
      (name && indexes.streetNames.get(name.toLowerCase())) ??
      streetNameNear(data, indexes, match.point, PLACE_STREET_RADIUS_METERS);
    const onStreet = places.filter((p) => p.streetName !== null && p.streetName === streetName);
    for (const place of onStreet) place.cleaning = mergeCleaning(place.cleaning, cleaning);
    if (onStreet.length === 0) {
      places.push({ zone: null, streetName, cleaning, distanceMeters: match.distanceMeters });
    }
  }

  if (places.length === 0) {
    const streetRadius = Math.max(radius, STREET_MATCH_RADIUS_METERS);
    places.push({
      zone: null,
      streetName: streetNameNear(data, indexes, [lon, lat], streetRadius),
      cleaning: NO_CLEANING,
      distanceMeters: 0,
    });
  }

  return places.sort((a, b) => a.distanceMeters - b.distanceMeters);
}
