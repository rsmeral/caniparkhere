import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("idb-keyval", () => ({
  get: vi.fn(),
  set: vi.fn(),
}));

import { get, set } from "idb-keyval";
import { loadData } from "./dataStore";

const manifest = { generatedAt: "2026-01-01T00:00:00.000Z", version: "abc123", datasets: {} };
const zps = { tariffs: [], features: [] };
const letni = { dates: [], features: [] };

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function mockFetch() {
  return vi.fn(async (url: string) => {
    if (url.endsWith("manifest.json")) return jsonResponse(manifest);
    if (url.endsWith("zps.json")) return jsonResponse(zps);
    if (url.endsWith("letni.json")) return jsonResponse(letni);
    throw new Error(`unexpected fetch: ${url}`);
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
    vi.mocked(get).mockImplementation(async (key) => {
      if (key === "caniparkhere:data-version") return "abc123";
      if (key === "caniparkhere:zps") return zps;
      if (key === "caniparkhere:letni") return letni;
      return undefined;
    });

    const result = await loadData();

    expect(result).toEqual({ zps, letni });
    // Only the manifest should have been fetched over the network - not zps/letni.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(set).not.toHaveBeenCalled();
  });

  it("fetches and caches datasets when the cached version is stale", async () => {
    vi.mocked(get).mockImplementation(async (key) => {
      if (key === "caniparkhere:data-version") return "old-version";
      return undefined;
    });

    const result = await loadData();

    expect(result).toEqual({ zps, letni });
    expect(fetch).toHaveBeenCalledTimes(3); // manifest + zps + letni
    expect(set).toHaveBeenCalledWith("caniparkhere:zps", zps);
    expect(set).toHaveBeenCalledWith("caniparkhere:letni", letni);
    expect(set).toHaveBeenCalledWith("caniparkhere:data-version", "abc123");
  });

  it("fetches and caches datasets when nothing is cached yet", async () => {
    vi.mocked(get).mockResolvedValue(undefined);

    const result = await loadData();

    expect(result).toEqual({ zps, letni });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
