import type { Feature, MultiPolygon } from "geojson";

export interface TariffRule {
  days: number[]; // 0=Mon .. 6=Sun
  start: string; // "HH:MM"
  end: string; // "HH:MM"; may be < start, meaning it wraps past midnight
  pricePerHour: number;
  dailyCapCzk: number | null;
}

export interface Tariff {
  id: number;
  raw: string;
  rules: TariffRule[];
}

export interface ZpsProps {
  code: string;
  category: "RES" | "MIX" | "VIS";
  tariffId: number | null;
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
