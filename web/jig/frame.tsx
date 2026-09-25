import { render } from "preact";
import { App } from "../src/app";
import type { GeoState } from "../src/useGeolocation";
import type { FrameMessage, JigMessage } from "./protocol";

// The app runs in its own document so that its viewport units and layout resolve against
// the phone-sized frame, not the jig page around it.
const root = document.getElementById("app")!;
const show = ({ geo, at, cleaningEverywhereToday }: Omit<JigMessage, "type">) =>
  render(
    <App
      geo={geo}
      now={at === null ? undefined : new Date(at)}
      cleaningEverywhereToday={cleaningEverywhereToday}
    />,
    root,
  );

window.addEventListener("message", (event: MessageEvent<JigMessage>) => {
  if (event.origin !== location.origin || event.data?.type !== "show") return;
  show(event.data);
});

show({ geo: { status: "searching" }, at: null, cleaningEverywhereToday: false });
parent.postMessage({ type: "ready" } satisfies FrameMessage, location.origin);
