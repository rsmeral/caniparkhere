import type { LoadedData } from "./dataStore";
import { PolygonIndex } from "./spatialIndex";
import { activeRuleNow } from "./tariffLogic";
import type { Bounds } from "./types";

export type Status =
  | { kind: "outOfArea" }
  | { kind: "closure"; streetName: string | null }
  | { kind: "paidZone"; pricePerHour: number; dailyCapCzk: number | null; until: string }
  | { kind: "residentZone" }
  | { kind: "freeZoneRightNow" }
  | { kind: "clear" };

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
}

// How far ahead to warn about an upcoming street-cleaning closure.
const WARNING_WINDOW_DAYS = 7;

/** Builds the R-tree indexes for a loaded dataset; do this once per data load, not per query. */
export function buildIndexes(data: LoadedData): Indexes {
  return {
    zps: new PolygonIndex(data.zps.features),
    letni: new PolygonIndex(data.letni.features),
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

  const zpsMatches = indexes.zps.findContaining(lon, lat);
  for (const feature of zpsMatches) {
    if (feature.properties.category === "RES") {
      return { status: { kind: "residentZone" }, upcomingClosure };
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
            until: rule.end,
          },
          upcomingClosure,
        };
      }
    }
  }
  if (zpsMatches.length > 0) {
    return { status: { kind: "freeZoneRightNow" }, upcomingClosure };
  }

  return { status: { kind: "clear" }, upcomingClosure };
}
