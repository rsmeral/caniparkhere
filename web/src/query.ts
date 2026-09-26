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

/** The status kinds that describe being in a specific zone - reused both as the resolved
 * result for a single confident match, and per-candidate when a coarse GPS fix leaves more
 * than one zone plausible. */
export type ZoneStatus =
  | ({
      kind: "paidZone";
      pricePerHour: number;
      dailyCapCzk: number | null;
      /** The longest a visitor may stay, in minutes, when the zone limits it and it's known. */
      maxStayMinutes: number | null;
      from: string;
      until: string;
      streetName: string | null;
    } & ZoneInfo)
  | ({ kind: "residentZone"; streetName: string | null } & ZoneInfo)
  | ({ kind: "freeZoneRightNow"; streetName: string | null } & ZoneInfo);

export type Status =
  | { kind: "outOfArea" }
  | { kind: "closure"; streetName: string | null }
  | ZoneStatus
  | { kind: "clear"; streetName: string | null }
  /** The GPS fix's own accuracy radius overlaps more than one zone, so a single
   * containment check can't be trusted - each plausible zone is resolved independently,
   * with the street that zone is on. */
  | { kind: "ambiguous"; candidates: ZoneStatus[] };

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
export const WARNING_WINDOW_DAYS = 5;

// The least distance at which a RÚIAN street centerline still counts as "this street". A
// centerline has no width, so a car at the curb of a wide street sits well off it even with
// a precise fix.
const STREET_MATCH_RADIUS_METERS = 25;

// How far from a zone a street centerline can be and still name the street that zone is on.
// Some zones are whole parking areas set back inside a block; every zone in the data has a
// centerline within 75m.
const ZONE_STREET_RADIUS_METERS = 100;

// A GPS accuracy radius bigger than this isn't worth treating as "somewhere in here" - past
// this range, city blocks and unrelated streets fall inside the circle too, so a candidate
// list would just be noise rather than a genuinely narrowed-down set of possibilities.
const MAX_AMBIGUITY_RADIUS_METERS = 100;

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
 * Names the RÚIAN street centerline nearest the point, within radiusMeters. Zone (zps) and
 * street-cleaning (letni) polygons don't carry street names of their own, so this is the
 * app's one source for "what street is this".
 */
function streetNameNear(
  data: LoadedData,
  streets: Indexes["streets"],
  [lon, lat]: [number, number],
  radiusMeters: number,
): string | null {
  const feature = streets.findNearest(lon, lat, radiusMeters);
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

/** A rule's daily cap, lowered to the tariff's holiday cap on a public holiday. */
function capAt(tariff: Tariff, rule: TariffRule, now: Date): number | null {
  if (tariff.holidayCapCzk === null || !isPublicHoliday(now)) return rule.dailyCapCzk;
  return Math.min(rule.dailyCapCzk ?? Infinity, tariff.holidayCapCzk);
}

/**
 * The street nearest to where the fix could be, with no zone to go by: within the accuracy
 * circle, never smaller than STREET_MATCH_RADIUS_METERS.
 */
function streetNameAtFix(
  data: LoadedData,
  streets: Indexes["streets"],
  point: [number, number],
  accuracyMeters: number | null,
): string | null {
  const radius = Math.max(
    STREET_MATCH_RADIUS_METERS,
    Math.min(accuracyMeters ?? 0, MAX_AMBIGUITY_RADIUS_METERS),
  );
  return streetNameNear(data, streets, point, radius);
}

/**
 * The street a zone is on, as seen from the fix: the street nearest the zone's point closest
 * to the fix, which is the fix itself when it's inside the zone. A zone code often spans
 * several streets, so the street depends on which part of the zone is in play.
 */
function streetNameOfZone(
  data: LoadedData,
  streets: Indexes["streets"],
  zonePoint: [number, number],
): string | null {
  return streetNameNear(data, streets, zonePoint, ZONE_STREET_RADIUS_METERS);
}

/**
 * Resolves a single zps feature to its status, as if it were the only zone in play. Every
 * category is paid while its tariff is running and free for anyone outside those hours -
 * a resident (blue) zone's tariff is what a visitor pays for a short stay. A resident zone
 * with no tariff has no visitor parking to report.
 */
function statusForZoneFeature(
  data: LoadedData,
  feature: LoadedData["zps"]["features"][number],
  streetName: string | null,
  now: Date,
): ZoneStatus {
  const zone: ZoneInfo = { code: feature.properties.code, category: feature.properties.category };
  if (feature.properties.category === "RES" && feature.properties.tariffId === null) {
    return { kind: "residentZone", streetName, ...zone };
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
        streetName,
        ...zone,
      };
    }
  }
  return { kind: "freeZoneRightNow", streetName, ...zone };
}

/**
 * Determines parking status at a point: street-cleaning closure today takes priority,
 * then a zone whose tariff is active right now, then any other zone here, else clear.
 * Also reports the soonest upcoming closure within the next week, if any (independent
 * of the primary status, since it's a heads-up rather than a current restriction).
 *
 * accuracyMeters, when given, is the GPS fix's own reported accuracy radius. When that
 * radius overlaps more than one zone, a plain containment check at the fix's exact
 * coordinates can't be trusted to pick the right one, so this reports every zone within
 * that radius as an "ambiguous" candidate list instead of guessing at a single answer.
 * When it reaches exactly one zone, that zone is the answer even if the fix is just outside.
 *
 * cleaningEverywhereToday treats every street-cleaning section as being cleaned today,
 * whatever its dates. It exists for simulating a closure in the jig.
 */
export function queryStatus(
  data: LoadedData,
  indexes: Indexes,
  lon: number,
  lat: number,
  now = new Date(),
  accuracyMeters: number | null = null,
  cleaningEverywhereToday = false,
): QueryResult {
  const today = toLocalISODate(now);
  const letniMatches = indexes.letni.findContaining(lon, lat);

  for (const feature of letniMatches) {
    const dates =
      feature.properties.datesId !== null ? data.letni.dates[feature.properties.datesId] : [];
    if (cleaningEverywhereToday || dates.includes(today)) {
      return {
        status: { kind: "closure", streetName: feature.properties.name },
        upcomingClosure: null,
      };
    }
  }

  const upcomingClosure = findUpcomingClosure(data, letniMatches, today);
  const fix: [number, number] = [lon, lat];

  if (accuracyMeters !== null && accuracyMeters > 0) {
    const radius = Math.min(accuracyMeters, MAX_AMBIGUITY_RADIUS_METERS);
    const nearby = indexes.zps.findNearby(lon, lat, radius);
    const nearestByCode = new Map<string, (typeof nearby)[number]>();
    for (const match of nearby) {
      if (!nearestByCode.has(match.feature.properties.code)) {
        nearestByCode.set(match.feature.properties.code, match);
      }
    }
    if (nearestByCode.size > 1) {
      const candidates = [...nearestByCode.values()]
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .map((match) =>
          statusForZoneFeature(
            data,
            match.feature,
            streetNameOfZone(data, indexes.streets, match.point),
            now,
          ),
        );
      return { status: { kind: "ambiguous", candidates }, upcomingClosure };
    }
    // One zone within reach that the fix itself isn't in: the fix is most likely off by a
    // little, so that zone is the answer. A fix inside a zone goes on to the containment
    // check below, which picks between overlapping sections of the same zone.
    const [only] = nearestByCode.values();
    if (nearestByCode.size === 1 && only.distanceMeters > 0) {
      const streetName = streetNameOfZone(data, indexes.streets, only.point);
      return { status: statusForZoneFeature(data, only.feature, streetName, now), upcomingClosure };
    }
  }

  const zpsMatches = indexes.zps.findContaining(lon, lat);
  const streetName =
    zpsMatches.length > 0
      ? streetNameOfZone(data, indexes.streets, fix)
      : streetNameAtFix(data, indexes.streets, fix, accuracyMeters);
  for (const feature of zpsMatches) {
    if (feature.properties.tariffId !== null) {
      const tariff = data.zps.tariffs[feature.properties.tariffId];
      const rule = activeRuleNow(tariff, now);
      if (rule) {
        return { status: statusForZoneFeature(data, feature, streetName, now), upcomingClosure };
      }
    }
  }
  if (zpsMatches.length > 0) {
    return {
      status: statusForZoneFeature(data, zpsMatches[0], streetName, now),
      upcomingClosure,
    };
  }

  return { status: { kind: "clear", streetName }, upcomingClosure };
}
