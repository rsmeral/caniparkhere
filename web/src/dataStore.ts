import { get, set } from "idb-keyval";
import type { Bounds, LetniData, Manifest, StreetData, ZpsData } from "./types";

const VERSION_KEY = "caniparkhere:data-version";
const MANIFEST_KEY = "caniparkhere:manifest";
const DATASET_KEYS = ["zps", "letni", "streets"] as const;

export interface LoadedData {
  zps: ZpsData;
  letni: LetniData;
  streets: StreetData;
  bounds: Bounds;
}

async function fetchJSON<T>(name: string): Promise<T> {
  const res = await fetch(`/data/${name}.json`);
  if (!res.ok) throw new Error(`Failed to fetch ${name}.json: ${res.status}`);
  return res.json();
}

/** The cached datasets, paired with `manifest` for its bounds. Null if any part is absent,
 * which sends the caller to the network for a complete set. */
async function cachedData(manifest: Manifest | undefined): Promise<LoadedData | null> {
  if (!manifest) return null;
  const [zps, letni, streets] = await Promise.all([
    get<ZpsData>("caniparkhere:zps"),
    get<LetniData>("caniparkhere:letni"),
    get<StreetData>("caniparkhere:streets"),
  ]);
  if (!zps || !letni || !streets) return null;
  return { zps, letni, streets, bounds: manifest.bounds };
}

/**
 * Loads the zone datasets, serving them from IndexedDB when the cached version matches the
 * current manifest, and re-fetching + re-caching only when it doesn't.
 *
 * The manifest is fetched whenever the network allows - it's tiny, and a live copy is what
 * detects a version change. Its last-seen copy is kept in IndexedDB too, so that when the
 * fetch fails the cached datasets are still reachable and still have bounds to go with
 * them. The datasets sit outside the service worker's precache by design, so this fallback
 * is what lets a device that has loaded once before work without a connection.
 */
export async function loadData(): Promise<LoadedData> {
  const manifest = await fetchJSON<Manifest>("manifest").catch(() => null);

  if (!manifest) {
    const cached = await cachedData(await get<Manifest>(MANIFEST_KEY));
    if (!cached) {
      throw new Error("you're offline and this device hasn't saved the zone data yet");
    }
    return cached;
  }

  await set(MANIFEST_KEY, manifest);

  if ((await get(VERSION_KEY)) === manifest.version) {
    const cached = await cachedData(manifest);
    if (cached) return cached;
  }

  const [zps, letni, streets] = await Promise.all(
    DATASET_KEYS.map((k) => fetchJSON<ZpsData | LetniData | StreetData>(k)),
  );
  await Promise.all([
    set(`caniparkhere:zps`, zps),
    set(`caniparkhere:letni`, letni),
    set(`caniparkhere:streets`, streets),
    set(VERSION_KEY, manifest.version),
  ]);
  return {
    zps: zps as ZpsData,
    letni: letni as LetniData,
    streets: streets as StreetData,
    bounds: manifest.bounds,
  };
}
