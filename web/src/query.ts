import type { LoadedData } from "./dataStore";
import { LineIndex, PolygonIndex } from "./spatialIndex";
import { activeRuleNow } from "./tariffLogic";
import type { Bounds, ZpsProps } from "./types";

/** The matched parking zone's own identity - shown as a lower-priority "here's what we
 * detected" line so the recommendation is checkable against what's painted on the curb. */
export interface ZoneInfo {
  code: string;
  category: ZpsProps["category"];
}

export type Status =
  | { kind: "outOfArea" }
  | { kind: "closure"; streetName: string | null }
  | ({
      kind: "paidZone";
      pricePerHour: number;
      dailyCapCzk: number | null;
      from: string;
      until: string;
      streetName: string | null;
    } & ZoneInfo)
  | ({ kind: "residentZone"; streetName: string | null } & ZoneInfo)
  | ({ kind: "freeZoneRightNow"; streetName: string | null } & ZoneInfo)
  | { kind: "clear"; streetName: string | null };

/**
 * Checks a point against the data's coverage envelope (see the pipeline's padBbox) - a
 * coarse "are you anywhere near Prague" sanity check, not a precise city-boundary test.
 */
export function isWithinBounds(bounds: Bounds, lon: number, lat: number): boolean {
  return (
    lon >= bounds.minLon && lon <= bounds.maxLon && lat >= bounds.minLat && lat <= bounds.maxLat
  );
}

export interface UpcomingClosure {
  date: string; // ISO date
  daysUntil: number;
  streetName: string | null;
}

export interface QueryResult {
  status: Status;
  upcomingClosure: UpcomingClosure | null;
}

export interface Indexes {
  zps: PolygonIndex<LoadedData["zps"]["features"][number]["properties"]>;
  letni: PolygonIndex<LoadedData["letni"]["features"][number]["properties"]>;
  streets: LineIndex<LoadedData["streets"]["features"][number]["properties"]>;
}

// How far ahead to warn about an upcoming street-cleaning closure.
const WARNING_WINDOW_DAYS = 5;

// How close a point needs to be to a RÚIAN street centerline to trust it as "this street" -
// close enough to be curb-level, wide enough to absorb ordinary GPS jitter.
const STREET_MATCH_RADIUS_METERS = 25;

/** Builds the R-tree indexes for a loaded dataset; do this once per data load, not per query. */
export function buildIndexes(data: LoadedData): Indexes {
  return {
    zps: new PolygonIndex(data.zps.features),
    letni: new PolygonIndex(data.letni.features),
    streets: new LineIndex(data.streets.features),
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

/**
 * Picks the RÚIAN street centerline nearest the point, if one falls within
 * STREET_MATCH_RADIUS_METERS - zone (zps) and street-cleaning (letni) polygons don't carry
 * street names of their own, so this is the app's one source for "what street is this".
 */
function findStreetName(data: LoadedData, streets: Indexes["streets"], lon: number, lat: number): string | null {
  const feature = streets.findNearest(lon, lat, STREET_MATCH_RADIUS_METERS);
  if (!feature || feature.properties.nameId === null) return null;
  return data.streets.names[feature.properties.nameId];
}

/** Finds the soonest closure date within the warning window across a set of matched letni features. */
function findUpcomingClosure(
  data: LoadedData,
  letniMatches: LoadedData["letni"]["features"],
  today: string,
): UpcomingClosure | null {
  let soonest: UpcomingClosure | null = null;
  for (const feature of letniMatches) {
    const dates =
      feature.properties.datesId !== null ? data.letni.dates[feature.properties.datesId] : [];
    for (const date of dates) {
      const daysUntil = daysBetween(today, date);
      if (daysUntil > 0 && daysUntil <= WARNING_WINDOW_DAYS) {
        if (!soonest || daysUntil < soonest.daysUntil) {
          soonest = { date, daysUntil, streetName: feature.properties.name };
        }
      }
    }
  }
  return soonest;
}

/**
 * Determines parking status at a point: street-cleaning closure today takes priority,
 * then any paid-zone tariff active right now, then resident-only zones, else clear.
 * Also reports the soonest upcoming closure within the next week, if any (independent
 * of the primary status, since it's a heads-up rather than a current restriction).
 */
export function queryStatus(
  data: LoadedData,
  indexes: Indexes,
  lon: number,
  lat: number,
  now = new Date(),
): QueryResult {
  const today = toLocalISODate(now);
  const letniMatches = indexes.letni.findContaining(lon, lat);

  for (const feature of letniMatches) {
    const dates =
      feature.properties.datesId !== null ? data.letni.dates[feature.properties.datesId] : [];
    if (dates.includes(today)) {
      return {
        status: { kind: "closure", streetName: feature.properties.name },
        upcomingClosure: null,
      };
    }
  }

  const upcomingClosure = findUpcomingClosure(data, letniMatches, today);
  const streetName = findStreetName(data, indexes.streets, lon, lat);

  const zpsMatches = indexes.zps.findContaining(lon, lat);
  for (const feature of zpsMatches) {
    const zone: ZoneInfo = { code: feature.properties.code, category: feature.properties.category };
    if (feature.properties.category === "RES") {
      return { status: { kind: "residentZone", streetName, ...zone }, upcomingClosure };
    }
    if (feature.properties.tariffId !== null) {
      const tariff = data.zps.tariffs[feature.properties.tariffId];
      const rule = activeRuleNow(tariff, now);
      if (rule) {
        return {
          status: {
            kind: "paidZone",
            pricePerHour: rule.pricePerHour,
            dailyCapCzk: rule.dailyCapCzk,
            from: rule.start,
            until: rule.end,
            streetName,
            ...zone,
          },
          upcomingClosure,
        };
      }
    }
  }
  if (zpsMatches.length > 0) {
    const feature = zpsMatches[0];
    const zone: ZoneInfo = { code: feature.properties.code, category: feature.properties.category };
    return { status: { kind: "freeZoneRightNow", streetName, ...zone }, upcomingClosure };
  }

  return { status: { kind: "clear", streetName }, upcomingClosure };
}
