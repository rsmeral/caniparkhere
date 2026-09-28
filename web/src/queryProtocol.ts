import type { QueryResult } from "./query";

/**
 * The messages exchanged with the query worker. Both directions stay small and plain -
 * a location in, an answer out - so nothing large is ever structured-cloned across the
 * boundary. The datasets and their indexes live entirely inside the worker.
 */

/** Main thread -> worker: what applies at a location. `id` is echoed back so an answer can
 * be paired with its request. */
export interface QueryRequest {
  kind: "query";
  id: number;
  lon: number;
  lat: number;
  accuracyMeters: number | null;
  /** The moment to answer for, in epoch milliseconds, or null for the time it's answered. */
  at: number | null;
  /** Treat every street-cleaning section as cleaned today. For simulating in the jig. */
  cleaningEverywhereToday: boolean;
}

/** Main thread -> worker: every parking area a permit can be for. */
export interface AreasRequest {
  kind: "areas";
  id: number;
}

export type WorkerRequest = QueryRequest | AreasRequest;

/** Worker -> main thread: the answer to request `id`, or why it couldn't be produced. */
export type QueryResponse =
  | { id: number; ok: true; result: QueryResult }
  | { id: number; ok: true; areas: string[] }
  | { id: number; ok: false; message: string };
