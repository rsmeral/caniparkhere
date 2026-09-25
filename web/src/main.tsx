import { render } from "preact";
import { App } from "./app";
import { useGeolocation } from "./useGeolocation";

function GpsApp() {
  return <App geo={useGeolocation()} />;
}

render(<GpsApp />, document.getElementById("app")!);
