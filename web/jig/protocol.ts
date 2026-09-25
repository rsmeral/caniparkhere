import type { GeoState } from "../src/useGeolocation";

/**
 * Messages between the jig page and the app running in its phone frame. The frame says
 * when it's ready to listen, and the jig answers with what to show - then sends it again
 * each time the pin, the accuracy, the location state or the time changes.
 */
export type FrameMessage = { type: "ready" };

/** `at` is the moment the app answers for, in epoch milliseconds, or null for the real time. */
export type JigMessage = { type: "show"; geo: GeoState; at: number | null };
