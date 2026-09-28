import type { QueryResult } from "./query";
import type { QueryResponse, WorkerRequest } from "./queryProtocol";

export interface QueryOptions {
  /** The moment to answer for. Left out, the answer is for the time it's worked out. */
  at?: Date;
  /** Treat every street-cleaning section as cleaned today. For simulating in the jig. */
  cleaningEverywhereToday?: boolean;
}

export interface QueryClient {
  query(
    lon: number,
    lat: number,
    accuracyMeters: number | null,
    options?: QueryOptions,
  ): Promise<QueryResult>;
  /** Every parking area a permit can be for, e.g. ["1", "2", "5", "5.1", ...]. */
  areas(): Promise<string[]>;
  terminate(): void;
}

type Answer = Extract<QueryResponse, { ok: true }>;

/**
 * Talks to the worker that owns the datasets and their indexes. Requests carry an id
 * because several location updates can be outstanding at once - the worker answers each
 * one as its data load allows, in no guaranteed order.
 */
export function createQueryClient(): QueryClient {
  const worker = new Worker(new URL("./queryWorker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, { resolve(answer: Answer): void; reject(e: Error): void }>();
  let nextId = 0;

  const failAll = (message: string) => {
    for (const { reject } of pending.values()) reject(new Error(message));
    pending.clear();
  };

  worker.addEventListener("message", (event: MessageEvent<QueryResponse>) => {
    const response = event.data;
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    if (response.ok) entry.resolve(response);
    else entry.reject(new Error(response.message));
  });

  // A worker that fails to start or throws at the top level never answers anything, so
  // waiting callers need to hear about it rather than sitting on a promise forever.
  worker.addEventListener("error", (event) => failAll(event.message || "Zone data worker failed"));

  const ask = (request: WorkerRequest) =>
    new Promise<Answer>((resolve, reject) => {
      pending.set(request.id, { resolve, reject });
      worker.postMessage(request);
    });

  return {
    async query(lon, lat, accuracyMeters, { at, cleaningEverywhereToday = false } = {}) {
      const answer = await ask({
        kind: "query",
        id: nextId++,
        lon,
        lat,
        accuracyMeters,
        at: at?.getTime() ?? null,
        cleaningEverywhereToday,
      });
      if (!("result" in answer)) throw new Error("Zone data worker sent no result");
      return answer.result;
    },
    async areas() {
      const answer = await ask({ kind: "areas", id: nextId++ });
      if (!("areas" in answer)) throw new Error("Zone data worker sent no areas");
      return answer.areas;
    },
    terminate() {
      worker.terminate();
      failAll("Zone data worker was shut down");
    },
  };
}
