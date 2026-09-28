import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Feature, FeatureCollection, Geometry, MultiLineString, MultiPolygon } from "geojson";

import { buildDictionary } from "./lib/dictionary.js";
import {
  bboxOfGeometry,
  mergeBbox,
  padBbox,
  roundGeometry,
  simplifyGeometry,
  type Bbox,
} from "./lib/geo.js";
import {
  fetchTskParking,
  type GolemioParking,
  holidayCap,
  type GolemioTariff,
  maxStayMinutesByCode,
  tariffIdByCode,
  tariffRules,
} from "./lib/golemio.js";
import { parseLetniDates } from "./lib/letniDates.js";
import { SOURCES } from "./sources.js";
import { parseTariffText, type TariffRule } from "./lib/tariff.js";
import { areasOfSection, fetchParkingAreas, type ParkingArea } from "./lib/vph.js";

const OUT_DIR = path.resolve(import.meta.dirname, "../../web/public/data");
// Local runs read the Golemio key from the repo's .env; CI sets it in the environment.
const ENV_FILE = path.resolve(import.meta.dirname, "../../.env");

async function fetchGeoJSON(url: string): Promise<FeatureCollection> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${url}`);
  return res.json() as Promise<FeatureCollection>;
}

function cleanGeometry(geometry: Geometry, simplifyTolerance: number): Geometry {
  return simplifyGeometry(roundGeometry(geometry), simplifyTolerance);
}

interface ZpsFeatureProps {
  code: string;
  category: string;
  tariffId: number | null;
  /** Resident zones only: the longest a visitor may stay, in minutes, when Golemio has it. */
  maxStayMinutes?: number | null;
  /** Blue and purple zones only: the parking areas whose permits cover it, in `areaSets`. */
  areasId?: number | null;
}

// Parking permits only cover blue and purple zones.
const PERMIT_CATEGORIES = new Set(["RES", "MIX"]);

// More blue and purple sections than this without an area means VPH's areas or the zones'
// codes have changed shape, so the build stops rather than publish permits that don't work.
const MAX_SECTIONS_WITHOUT_AREA = 10;

/**
 * A zone section's tariff: where it came from (a Golemio tariff id, or the LKOD
 * tariftext it was parsed from) and its rules.
 */
interface ZoneTariff {
  source: string;
  rules: TariffRule[];
  holidayCapCzk: number | null;
}

/**
 * Builds the zones, taking each section's tariff from TSK's data in Golemio and falling
 * back to the LKOD tariftext for a section Golemio doesn't have.
 */
function buildZps(
  fc: FeatureCollection,
  tsk: { parkings: GolemioParking[]; tariffs: GolemioTariff[] },
  parkingAreas: ParkingArea[],
) {
  const maxStayByCode = maxStayMinutesByCode(tsk.parkings, tsk.tariffs);
  const golemioTariffByCode = tariffIdByCode(tsk.parkings);
  const golemioTariffs = new Map(tsk.tariffs.map((t) => [t.id, t]));
  const counts = { golemio: 0, tariftext: 0, none: 0 };

  // A section with no tariff at all must dictionary-encode to a null tariffId, not a
  // table entry with no rules.
  const zoneTariffs = fc.features.map((f): ZoneTariff | null => {
    const golemio = golemioTariffs.get(golemioTariffByCode.get((f.properties as any).code) ?? "");
    if (golemio) {
      counts.golemio++;
      return {
        source: `golemio:${golemio.id}`,
        rules: tariffRules(golemio),
        holidayCapCzk: holidayCap(golemio),
      };
    }
    const text = (f.properties as any).tariftext as string;
    const rules = parseTariffText(text);
    if (rules) {
      counts.tariftext++;
      return { source: text, rules, holidayCapCzk: null };
    }
    counts.none++;
    return null;
  });
  console.log(
    `  zps: tariffs from Golemio ${counts.golemio}, from tariftext ${counts.tariftext}, none ${counts.none}`,
  );
  const { table, indexes } = buildDictionary(zoneTariffs);
  const tariffs = table.map((t, id) => ({ id, ...t }));

  const fallbacks: string[] = [];
  const sectionAreas = fc.features.map((f) => {
    const { code, category } = f.properties as any;
    if (!PERMIT_CATEGORIES.has(category)) return null;
    return areasOfSection(code, f.geometry as MultiPolygon, parkingAreas, (c) => fallbacks.push(c));
  });
  if (fallbacks.length > 0) {
    console.warn(`  zps: outside every VPH district, so in their code's: ${fallbacks.join(", ")}`);
  }
  const withoutArea = fc.features.filter((_, i) => sectionAreas[i]?.length === 0);
  if (withoutArea.length > MAX_SECTIONS_WITHOUT_AREA) {
    throw new Error(`zps: ${withoutArea.length} blue and purple sections have no parking area`);
  }
  const { table: areaSets, indexes: areasIds } = buildDictionary(
    sectionAreas.map((a) => (a && a.length > 0 ? a : null)),
  );

  const features: Feature<MultiPolygon, ZpsFeatureProps>[] = fc.features.map((f, i) => {
    const code = (f.properties as any).code as string;
    const category = (f.properties as any).category as string;
    return {
      type: "Feature",
      geometry: cleanGeometry(f.geometry, 0.00002) as MultiPolygon,
      properties: {
        code,
        category,
        tariffId: indexes[i],
        ...(category === "RES" ? { maxStayMinutes: maxStayByCode.get(code) ?? null } : {}),
        ...(PERMIT_CATEGORIES.has(category) ? { areasId: areasIds[i] } : {}),
      },
    };
  });

  const unmatched = features.filter((f) => f.properties.maxStayMinutes === null).length;
  if (unmatched > 0) {
    console.warn(`  zps: ${unmatched} resident zone sections have no max stay in Golemio`);
  }

  return { tariffs, areaSets, features };
}

interface LetniFeatureProps {
  name: string | null;
  datesId: number | null;
}

function buildLetni(fc: FeatureCollection) {
  const dateArrays = fc.features.map((f) => parseLetniDates((f.properties as any).day as string));
  const { table: dates, indexes: datesIndexes } = buildDictionary(dateArrays);

  const names = fc.features.map((f) => ((f.properties as any).nazev as string) ?? null);
  const { table: nameTable, indexes: nameIndexes } = buildDictionary(names);

  const features: Feature<MultiPolygon, LetniFeatureProps>[] = fc.features.map((f, i) => ({
    type: "Feature",
    geometry: cleanGeometry(f.geometry, 0.00003) as MultiPolygon,
    properties: {
      name: nameIndexes[i] === null ? null : nameTable[nameIndexes[i]!],
      datesId: datesIndexes[i],
    },
  }));

  return { dates, features };
}

// The RÚIAN query returns a mix of LineString (single stretch) and MultiLineString
// (a street with multiple disjoint stretches) - normalized to one shape for the index.
function toMultiLineString(geometry: Geometry): MultiLineString {
  if (geometry.type === "MultiLineString") return geometry;
  if (geometry.type === "LineString") {
    return { type: "MultiLineString", coordinates: [geometry.coordinates] };
  }
  throw new Error(`Unexpected street geometry type: ${geometry.type}`);
}

interface StreetFeatureProps {
  nameId: number | null;
}

function buildStreets(fc: FeatureCollection) {
  const names = fc.features.map((f) => ((f.properties as any).nazev as string) ?? null);
  const { table: nameTable, indexes: nameIndexes } = buildDictionary(names);

  const features: Feature<MultiLineString, StreetFeatureProps>[] = fc.features.map((f, i) => ({
    type: "Feature",
    geometry: cleanGeometry(toMultiLineString(f.geometry), 0.00002) as MultiLineString,
    properties: {
      nameId: nameIndexes[i],
    },
  }));

  return { names: nameTable, features };
}

function bboxOfFeatures(features: Feature<Geometry, unknown>[]): Bbox {
  return features.map((f) => bboxOfGeometry(f.geometry)).reduce(mergeBbox);
}

async function writeJSON(name: string, data: unknown): Promise<{ name: string; bytes: number }> {
  const json = JSON.stringify(data);
  await writeFile(path.join(OUT_DIR, `${name}.json`), json);
  return { name, bytes: Buffer.byteLength(json) };
}

async function withRetries<T>(task: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await task();
    } catch (err) {
      lastErr = err;
      console.warn(`  attempt ${i}/${attempts} failed: ${(err as Error).message}`);
    }
  }
  throw lastErr;
}

function fetchAndBuild<T>(url: string, build: (fc: FeatureCollection) => T): Promise<T> {
  return withRetries(async () => build(await fetchGeoJSON(url)));
}

async function main() {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const golemioKey = process.env.GOLEMIO_API_KEY;
  if (!golemioKey) throw new Error("GOLEMIO_API_KEY is not set (see README, Data pipeline)");

  await mkdir(OUT_DIR, { recursive: true });

  console.log("Fetching + cleaning source datasets...");
  const [tsk, parkingAreas, zpsSource, letni, streets] = await Promise.all([
    withRetries(() => fetchTskParking(golemioKey)),
    withRetries(fetchParkingAreas),
    withRetries(() => fetchGeoJSON(SOURCES.zps)),
    fetchAndBuild(SOURCES.letni, buildLetni),
    fetchAndBuild(SOURCES.streets, buildStreets),
  ]);
  const zps = buildZps(zpsSource, tsk, parkingAreas);

  console.log("Writing output...");
  const written = await Promise.all([
    writeJSON("zps", zps),
    writeJSON("letni", letni),
    writeJSON("streets", streets),
  ]);

  const bounds = padBbox(
    [zps, letni, streets].map((d) => bboxOfFeatures(d.features)).reduce(mergeBbox),
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    version: createHash("sha256")
      .update(written.map((w) => `${w.name}:${w.bytes}`).join("|"))
      .digest("hex")
      .slice(0, 16),
    datasets: Object.fromEntries(written.map((w) => [w.name, { bytes: w.bytes }])),
    bounds,
  };
  await writeJSON("manifest", manifest);

  for (const w of written) {
    console.log(`  ${w.name}.json: ${(w.bytes / 1024).toFixed(1)} KB`);
  }
  console.log(`manifest version: ${manifest.version}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
