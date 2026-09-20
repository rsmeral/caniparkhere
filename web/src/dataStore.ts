import { get, set } from "idb-keyval";
import type { Bounds, LetniData, Manifest, ZpsData } from "./types";

const VERSION_KEY = "caniparkhere:data-version";
const DATASET_KEYS = ["zps", "letni"] as const;

export interface LoadedData {
  zps: ZpsData;
  letni: LetniData;
  bounds: Bounds;
}

async function fetchJSON<T>(name: string): Promise<T> {
  const res = await fetch(`/data/${name}.json`);
  if (!res.ok) throw new Error(`Failed to fetch ${name}.json: ${res.status}`);
  return res.json();
}

/**
 * Loads the zone datasets, serving them from IndexedDB when the cached version matches
 * the current manifest, and re-fetching + re-caching only when it doesn't. The manifest
 * itself (including `bounds`) is always fetched fresh - it's tiny, and we need it live to
 * detect a version change anyway.
 */
export async function loadData(): Promise<LoadedData> {
  const manifest = await fetchJSON<Manifest>("manifest");
  const cachedVersion = await get(VERSION_KEY);

  if (cachedVersion === manifest.version) {
    const cached = await Promise.all(DATASET_KEYS.map((k) => get(`caniparkhere:${k}`)));
    if (cached.every(Boolean)) {
      const [zps, letni] = cached;
      return { zps, letni, bounds: manifest.bounds };
    }
  }

  const [zps, letni] = await Promise.all(
    DATASET_KEYS.map((k) => fetchJSON<ZpsData | LetniData>(k)),
  );
  await Promise.all([
    set(`caniparkhere:zps`, zps),
    set(`caniparkhere:letni`, letni),
    set(VERSION_KEY, manifest.version),
  ]);
  return { zps: zps as ZpsData, letni: letni as LetniData, bounds: manifest.bounds };
}
