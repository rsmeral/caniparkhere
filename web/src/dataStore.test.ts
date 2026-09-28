import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("idb-keyval", () => ({
  get: vi.fn(),
  set: vi.fn(),
}));

import { get, set } from "idb-keyval";
import { loadData } from "./dataStore";

const bounds = { minLon: 14.16, minLat: 49.84, maxLon: 14.8, maxLat: 50.27 };
const manifest = {
  generatedAt: "2026-01-01T00:00:00.000Z",
  version: "abc123",
  datasets: {},
  bounds,
};
const zps = { tariffs: [], features: [] };
const letni = { dates: [], features: [] };
const streets = { names: [], features: [] };

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function mockFetch() {
  return vi.fn(async (url: string) => {
    if (url.endsWith("manifest.json")) return jsonResponse(manifest);
    if (url.endsWith("zps.json")) return jsonResponse(zps);
    if (url.endsWith("letni.json")) return jsonResponse(letni);
    if (url.endsWith("streets.json")) return jsonResponse(streets);
    throw new Error(`unexpected fetch: ${url}`);
  });
}

/** An IndexedDB standing in for a device that has already loaded the app once. */
function cacheOf({ version, withManifest = true }: { version?: string; withManifest?: boolean }) {
  return async (key: IDBValidKey) => {
    if (key === "caniparkhere:data-version") return version;
    if (key === "caniparkhere:manifest") return withManifest ? manifest : undefined;
    if (key === "caniparkhere:zps") return zps;
    if (key === "caniparkhere:letni") return letni;
    if (key === "caniparkhere:streets") return streets;
    return undefined;
  };
}

/** A fetch that fails the way a browser does with no connection. */
function offlineFetch() {
  return vi.fn(async () => {
    throw new TypeError("NetworkError when attempting to fetch resource");
  });
}

describe("loadData", () => {
  beforeEach(() => {
    vi.mocked(get).mockReset();
    vi.mocked(set).mockReset();
    vi.stubGlobal("fetch", mockFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves cached data without refetching datasets when the cached version matches", async () => {
    vi.mocked(get).mockImplementation(cacheOf({ version: "abc123" }));

    const result = await loadData();

    expect(result).toEqual({ zps, letni, streets, bounds });
    // Only the manifest should have been fetched over the network - not the datasets.
    expect(fetch).toHaveBeenCalledTimes(1);
    // The live manifest is kept so the next load can fall back to it offline.
    expect(set).toHaveBeenCalledWith("caniparkhere:manifest", manifest);
    expect(set).not.toHaveBeenCalledWith("caniparkhere:zps", zps);
  });

  it("fetches and caches datasets when the cached version is stale", async () => {
    vi.mocked(get).mockImplementation(async (key) => {
      if (key === "caniparkhere:data-version") return "old-version";
      return undefined;
    });

    const result = await loadData();

    expect(result).toEqual({ zps, letni, streets, bounds });
    expect(fetch).toHaveBeenCalledTimes(4); // manifest + zps + letni + streets
    expect(set).toHaveBeenCalledWith("caniparkhere:zps", zps);
    expect(set).toHaveBeenCalledWith("caniparkhere:letni", letni);
    expect(set).toHaveBeenCalledWith("caniparkhere:streets", streets);
    expect(set).toHaveBeenCalledWith("caniparkhere:data-version", "abc123");
  });

  it("fetches and caches datasets when nothing is cached yet", async () => {
    vi.mocked(get).mockResolvedValue(undefined);

    const result = await loadData();

    expect(result).toEqual({ zps, letni, streets, bounds });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("serves cached data offline, when the manifest itself can't be fetched", async () => {
    vi.stubGlobal("fetch", offlineFetch());
    vi.mocked(get).mockImplementation(cacheOf({ version: "abc123" }));

    const result = await loadData();

    expect(result).toEqual({ zps, letni, streets, bounds });
  });

  it("serves cached data offline even when the cached version is stale", async () => {
    // Nothing can be refreshed without a connection, so out-of-date data beats no data.
    vi.stubGlobal("fetch", offlineFetch());
    vi.mocked(get).mockImplementation(cacheOf({ version: "old-version" }));

    const result = await loadData();

    expect(result).toEqual({ zps, letni, streets, bounds });
  });

  it("explains itself when offline with nothing cached to fall back on", async () => {
    vi.stubGlobal("fetch", offlineFetch());
    vi.mocked(get).mockResolvedValue(undefined);

    await expect(loadData()).rejects.toThrow(
      "No zone data cached yet, and no connection to fetch it.",
    );
  });

  it("backfills the manifest for a device cached before it was stored, without refetching", async () => {
    // Datasets cached by an earlier version have no manifest saved alongside them. The
    // live one supplies bounds for this load and is stored, so the next load works offline.
    vi.mocked(get).mockImplementation(cacheOf({ version: "abc123", withManifest: false }));

    const result = await loadData();

    expect(result).toEqual({ zps, letni, streets, bounds });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith("caniparkhere:manifest", manifest);
    expect(set).not.toHaveBeenCalledWith("caniparkhere:zps", zps);
  });
});
