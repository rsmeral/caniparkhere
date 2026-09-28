import { loadData } from "./dataStore";
import { buildIndexes, isWithinBounds, permitAreas, queryPlaces, type QueryResult } from "./query";
import type { QueryResponse, WorkerRequest } from "./queryProtocol";

// The worker global. `lib.dom` types `self` as a Window, so the two calls this worker makes
// are narrowed here instead - which also pins postMessage to the protocol type.
const ctx = self as unknown as {
  postMessage(message: QueryResponse): void;
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerRequest>) => void): void;
};

// Fetching, parsing and indexing the datasets is around a second of solid CPU. It starts as
// soon as the worker does, so it overlaps with the browser acquiring its first GPS fix
// rather than blocking the main thread from painting.
const ready = loadData().then((data) => ({ data, indexes: buildIndexes(data) }));

ctx.addEventListener("message", async (event) => {
  const request = event.data;
  const { id } = request;
  try {
    const { data, indexes } = await ready;
    if (request.kind === "areas") {
      ctx.postMessage({ id, ok: true, areas: permitAreas(data) });
      return;
    }
    const { lon, lat, accuracyMeters, at, cleaningEverywhereToday } = request;
    const result: QueryResult = isWithinBounds(data.bounds, lon, lat)
      ? {
          kind: "places",
          places: queryPlaces(
            data,
            indexes,
            lon,
            lat,
            at === null ? undefined : new Date(at),
            accuracyMeters,
            cleaningEverywhereToday,
          ),
        }
      : { kind: "outOfArea" };
    ctx.postMessage({ id, ok: true, result });
  } catch (err) {
    ctx.postMessage({ id, ok: false, message: (err as Error).message });
  }
});
