import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Feature, FeatureCollection, Geometry, MultiLineString, MultiPolygon } from "geojson";

import { buildDictionary } from "./lib/dictionary.js";
import { roundGeometry, simplifyGeometry } from "./lib/geo.js";
import { parseLetniDates } from "./lib/letniDates.js";
import { SOURCES } from "./sources.js";
import { parseTariffText, type TariffRule } from "./lib/tariff.js";

const OUT_DIR = path.resolve(import.meta.dirname, "../../web/public/data");

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
}

function buildZps(fc: FeatureCollection) {
  // Blank tariftext ("no visitor tariff here") must dictionary-encode to a null tariffId,
  // not a real table entry - parseTariffText(raw) would be null and blow up activeRuleNow().
  const rawTariffs = fc.features.map((f) => {
    const t = (f.properties as any).tariftext as string;
    return t && t.trim() ? t : null;
  });
  const { table, indexes } = buildDictionary(rawTariffs);

  const tariffs = table.map((raw, id) => ({
    id,
    raw,
    rules: parseTariffText(raw) as TariffRule[],
  }));

  const features: Feature<MultiPolygon, ZpsFeatureProps>[] = fc.features.map((f, i) => ({
    type: "Feature",
    geometry: cleanGeometry(f.geometry, 0.00002) as MultiPolygon,
    properties: {
      code: (f.properties as any).code,
      category: (f.properties as any).category,
      tariffId: indexes[i],
    },
  }));

  return { tariffs, features };
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

interface ZimniFeatureProps {
  level: number;
}

function buildZimni(fc: FeatureCollection) {
  const features: Feature<MultiLineString, ZimniFeatureProps>[] = fc.features.map((f) => ({
    type: "Feature",
    geometry: cleanGeometry(f.geometry, 0.00002) as MultiLineString,
    properties: {
      level: (f.properties as any).idt_level,
    },
  }));

  return { features };
}

async function writeJSON(name: string, data: unknown): Promise<{ name: string; bytes: number }> {
  const json = JSON.stringify(data);
  await writeFile(path.join(OUT_DIR, `${name}.json`), json);
  return { name, bytes: Buffer.byteLength(json) };
}

async function fetchAndBuild<T>(
  url: string,
  build: (fc: FeatureCollection) => T,
  attempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const fc = await fetchGeoJSON(url);
      return build(fc);
    } catch (err) {
      lastErr = err;
      console.warn(`  attempt ${i}/${attempts} failed: ${(err as Error).message}`);
    }
  }
  throw lastErr;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("Fetching + cleaning source datasets...");
  const [zps, letni, zimni] = await Promise.all([
    fetchAndBuild(SOURCES.zps, buildZps),
    fetchAndBuild(SOURCES.letni, buildLetni),
    fetchAndBuild(SOURCES.zimni, buildZimni),
  ]);

  console.log("Writing output...");
  const written = await Promise.all([
    writeJSON("zps", zps),
    writeJSON("letni", letni),
    writeJSON("zimni", zimni),
  ]);

  const manifest = {
    generatedAt: new Date().toISOString(),
    version: createHash("sha256")
      .update(written.map((w) => `${w.name}:${w.bytes}`).join("|"))
      .digest("hex")
      .slice(0, 16),
    datasets: Object.fromEntries(written.map((w) => [w.name, { bytes: w.bytes }])),
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
