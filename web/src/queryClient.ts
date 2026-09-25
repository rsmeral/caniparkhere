import type { QueryResult } from "./query";
import type { QueryRequest, QueryResponse } from "./queryProtocol";

export interface QueryClient {
  query(lon: number, lat: number, accuracyMeters: number | null, at?: Date): Promise<QueryResult>;
  terminate(): void;
}

/**
 * Talks to the worker that owns the datasets and their indexes. Requests carry an id
 * because several location updates can be outstanding at once - the worker answers each
 * one as its data load allows, in no guaranteed order.
 */
export function createQueryClient(): QueryClient {
  const worker = new Worker(new URL("./queryWorker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, { resolve(r: QueryResult): void; reject(e: Error): void }>();
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
    if (response.ok) entry.resolve(response.result);
    else entry.reject(new Error(response.message));
  });

  // A worker that fails to start or throws at the top level never answers anything, so
  // waiting callers need to hear about it rather than sitting on a promise forever.
  worker.addEventListener("error", (event) => failAll(event.message || "Zone data worker failed"));

  return {
    query(lon, lat, accuracyMeters, at) {
      const id = nextId++;
      const request: QueryRequest = { id, lon, lat, accuracyMeters, at: at?.getTime() ?? null };
      return new Promise<QueryResult>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage(request);
      });
    },
    terminate() {
      worker.terminate();
      failAll("Zone data worker was shut down");
    },
  };
}
