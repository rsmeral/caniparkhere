import type { Feature, MultiLineString, MultiPolygon } from "geojson";

export interface TariffRule {
  days: number[]; // 0=Mon .. 6=Sun
  start: string; // "HH:MM"
  end: string; // "HH:MM", within the same day
  pricePerHour: number;
  dailyCapCzk: number | null;
}

export interface Tariff {
  id: number;
  /** Where the rules came from: `golemio:<tariff id>`, or the LKOD tariftext they were
   * parsed from. For tracing an answer back to its data. */
  source: string;
  rules: TariffRule[];
}

export interface ZpsProps {
  code: string;
  category: "RES" | "MIX" | "VIS";
  tariffId: number | null;
  /** Resident zones only: the longest a visitor may stay, in minutes, when it's known. */
  maxStayMinutes?: number | null;
}

export interface ZpsData {
  tariffs: Tariff[];
  features: Feature<MultiPolygon, ZpsProps>[];
}

export interface LetniProps {
  name: string | null;
  datesId: number | null;
}

export interface LetniData {
  dates: string[][]; // ISO date strings, e.g. ["2026-04-07", "2026-10-05"]
  features: Feature<MultiPolygon, LetniProps>[];
}

export interface StreetProps {
  nameId: number | null;
}

export interface StreetData {
  names: string[];
  features: Feature<MultiLineString, StreetProps>[];
}

export interface Bounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface Manifest {
  generatedAt: string;
  version: string;
  datasets: Record<string, { bytes: number }>;
  bounds: Bounds;
}
