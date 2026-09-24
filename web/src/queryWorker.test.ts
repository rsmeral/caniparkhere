import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./dataStore", () => ({ loadData: vi.fn() }));

import { loadData } from "./dataStore";
import type { QueryRequest, QueryResponse } from "./queryProtocol";

const bounds = { minLon: 14.16, minLat: 49.84, maxLon: 14.8, maxLat: 50.27 };
const emptyData = {
  zps: { tariffs: [], features: [] },
  letni: { dates: [], features: [] },
  streets: { names: [], features: [] },
  bounds,
};

/**
 * Loads the worker module against a stubbed worker global, and hands back a way to post it
 * a request and await the reply. The module is re-imported per test because it kicks off
 * its data load at import time.
 */
async function startWorker() {
  let onMessage: ((event: { data: QueryRequest }) => void) | undefined;
  const replies: QueryResponse[] = [];
  const waiters: ((response: QueryResponse) => void)[] = [];

  vi.stubGlobal("self", {
    addEventListener: (_type: string, listener: typeof onMessage) => {
      onMessage = listener;
    },
    postMessage: (response: QueryResponse) => {
      replies.push(response);
      waiters.shift()?.(response);
    },
  });

  vi.resetModules();
  await import("./queryWorker");

  return async (request: QueryRequest): Promise<QueryResponse> => {
    const reply = new Promise<QueryResponse>((resolve) => waiters.push(resolve));
    onMessage?.({ data: request });
    return reply;
  };
}

describe("queryWorker", () => {
  beforeEach(() => {
    vi.mocked(loadData).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers a point inside the covered area", async () => {
    vi.mocked(loadData).mockResolvedValue(emptyData);
    const ask = await startWorker();

    const response = await ask({ id: 7, lon: 14.42, lat: 50.08, accuracyMeters: 20 });

    expect(response).toEqual({
      id: 7,
      ok: true,
      result: { status: { kind: "clear", streetName: null }, upcomingClosure: null },
    });
  });

  it("reports a point outside the covered area without consulting the indexes", async () => {
    vi.mocked(loadData).mockResolvedValue(emptyData);
    const ask = await startWorker();

    const response = await ask({ id: 8, lon: 2.35, lat: 48.86, accuracyMeters: 20 });

    expect(response).toEqual({
      id: 8,
      ok: true,
      result: { status: { kind: "outOfArea" }, upcomingClosure: null },
    });
  });

  it("reports a failed data load back to the caller instead of going quiet", async () => {
    vi.mocked(loadData).mockRejectedValue(new Error("Failed to fetch zps.json: 404"));
    const ask = await startWorker();

    const response = await ask({ id: 9, lon: 14.42, lat: 50.08, accuracyMeters: 20 });

    expect(response).toEqual({ id: 9, ok: false, message: "Failed to fetch zps.json: 404" });
  });

  it("loads the data once, however many queries arrive", async () => {
    vi.mocked(loadData).mockResolvedValue(emptyData);
    const ask = await startWorker();

    await ask({ id: 1, lon: 14.42, lat: 50.08, accuracyMeters: 20 });
    await ask({ id: 2, lon: 14.43, lat: 50.09, accuracyMeters: 20 });

    expect(vi.mocked(loadData)).toHaveBeenCalledTimes(1);
  });
});
