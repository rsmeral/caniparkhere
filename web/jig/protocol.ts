import type { GeoState } from "../src/useGeolocation";

/**
 * Messages between the jig page and the app running in its phone frame. The frame says
 * when it's ready to listen, and the jig answers with the location to show - then sends a
 * new one each time the pin, the accuracy or the location state changes.
 */
export type FrameMessage = { type: "ready" };
export type JigMessage = { type: "geo"; geo: GeoState };
