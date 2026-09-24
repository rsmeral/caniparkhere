import type { QueryResult } from "./query";

/**
 * The messages exchanged with the query worker. Both directions stay small and plain -
 * a location in, an answer out - so nothing large is ever structured-cloned across the
 * boundary. The datasets and their indexes live entirely inside the worker.
 */

/** Main thread -> worker. `id` is echoed back so an answer can be paired with its request. */
export interface QueryRequest {
  id: number;
  lon: number;
  lat: number;
  accuracyMeters: number | null;
}

/** Worker -> main thread: the answer to request `id`, or why it couldn't be produced. */
export type QueryResponse =
  | { id: number; ok: true; result: QueryResult }
  | { id: number; ok: false; message: string };
