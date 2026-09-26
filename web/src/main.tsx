import { render } from "preact";
import { useState } from "preact/hooks";
import { App } from "./app";
import { useGeolocation } from "./useGeolocation";

function GpsApp() {
  const [paused, setPaused] = useState(false);
  return <App geo={useGeolocation(paused)} onPausedChange={setPaused} />;
}

render(<GpsApp />, document.getElementById("app")!);
