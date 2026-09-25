import { render } from "preact";
import { App } from "../src/app";
import type { GeoState } from "../src/useGeolocation";
import type { FrameMessage, JigMessage } from "./protocol";

// The app runs in its own document so that its viewport units and layout resolve against
// the phone-sized frame, not the jig page around it.
const root = document.getElementById("app")!;
const show = (geo: GeoState, at: number | null) =>
  render(<App geo={geo} now={at === null ? undefined : new Date(at)} />, root);

window.addEventListener("message", (event: MessageEvent<JigMessage>) => {
  if (event.origin !== location.origin || event.data?.type !== "show") return;
  show(event.data.geo, event.data.at);
});

show({ status: "searching" }, null);
parent.postMessage({ type: "ready" } satisfies FrameMessage, location.origin);
