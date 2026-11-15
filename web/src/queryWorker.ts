import { loadData } from "./dataStore";
import {
  buildIndexes,
  isWithinBounds,
  mapArea,
  permitAreas,
  placeOfZone,
  queryPlaces,
  type QueryResult,
} from "./query";
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
/** A request's moment as a Date, or undefined for the time it's answered. */
const atDate = (at: number | null) => (at === null ? undefined : new Date(at));

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
    if (request.kind === "mapArea") {
      const { box, at, cleaningEverywhereToday } = request;
      const area = mapArea(data, indexes, box, atDate(at), cleaningEverywhereToday);
      ctx.postMessage({ id, ok: true, mapArea: area });
      return;
    }
    if (request.kind === "zonePlace") {
      const { code, lon, lat, at, cleaningEverywhereToday } = request;
      const place = placeOfZone(data, indexes, code, lon, lat, atDate(at), cleaningEverywhereToday);
      ctx.postMessage({ id, ok: true, place });
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
            atDate(at),
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
