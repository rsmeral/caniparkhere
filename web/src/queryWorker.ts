import { loadData } from "./dataStore";
import { buildIndexes, isWithinBounds, queryStatus } from "./query";
import type { QueryRequest, QueryResponse } from "./queryProtocol";

// The worker global. `lib.dom` types `self` as a Window, so the two calls this worker makes
// are narrowed here instead - which also pins postMessage to the protocol type.
const ctx = self as unknown as {
  postMessage(message: QueryResponse): void;
  addEventListener(type: "message", listener: (event: MessageEvent<QueryRequest>) => void): void;
};

// Fetching, parsing and indexing the datasets is around a second of solid CPU. It starts as
// soon as the worker does, so it overlaps with the browser acquiring its first GPS fix
// rather than blocking the main thread from painting.
const ready = loadData().then((data) => ({ data, indexes: buildIndexes(data) }));

ctx.addEventListener("message", async (event) => {
  const { id, lon, lat, accuracyMeters } = event.data;
  try {
    const { data, indexes } = await ready;
    const result = isWithinBounds(data.bounds, lon, lat)
      ? queryStatus(data, indexes, lon, lat, undefined, accuracyMeters)
      : { status: { kind: "outOfArea" as const }, upcomingClosure: null };
    ctx.postMessage({ id, ok: true, result });
  } catch (err) {
    ctx.postMessage({ id, ok: false, message: (err as Error).message });
  }
});
