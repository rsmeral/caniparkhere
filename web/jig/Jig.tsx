import type { RefObject } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ZONE_CATEGORY } from "../src/describe";
import type { GeoState } from "../src/useGeolocation";
import { PinMap } from "./PinMap";
import { DEFAULT_PIN, formatPinHash, parsePinHash, type Pin } from "./pinState";
import type { FrameMessage, JigMessage } from "./protocol";
import { CLEANING_COLOR, type Overlays } from "./zoneLayers";

/** "pin" is a fix at the pin; the others are the states the browser's GPS can be in. */
type Source = "pin" | Exclude<GeoState["status"], "ready">;

const SOURCES: { value: Source; label: string }[] = [
  { value: "pin", label: "Fix at the pin" },
  { value: "searching", label: "Searching" },
  { value: "unavailable", label: "Unavailable (gave up)" },
  { value: "denied", label: "Permission denied" },
  { value: "unsupported", label: "Unsupported" },
];

const DEVICES = [
  { label: "390 × 844 (iPhone 15)", width: 390, height: 844 },
  { label: "360 × 800 (small Android)", width: 360, height: 800 },
  { label: "412 × 915 (Pixel)", width: 412, height: 915 },
  { label: "375 × 667 (iPhone SE)", width: 375, height: 667 },
];

const MAX_ACCURACY_METERS = 250;

export function Jig() {
  const [pin, setPin] = useState<Pin>(() => parsePinHash(location.hash) ?? DEFAULT_PIN);
  const [source, setSource] = useState<Source>("pin");
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [overlays, setOverlays] = useState<Overlays>({ zones: true, cleaning: false });
  const frame = useRef<HTMLIFrameElement>(null);

  const geo: GeoState = useMemo(
    () =>
      source === "pin"
        ? { status: "ready", lon: pin.lon, lat: pin.lat, accuracyMeters: pin.accuracyMeters }
        : { status: source },
    [pin, source],
  );

  const send = (g: GeoState) =>
    frame.current?.contentWindow?.postMessage(
      { type: "geo", geo: g } satisfies JigMessage,
      location.origin,
    );

  // The frame announces itself on every load, including reloads from a code change, and
  // gets the current location in reply.
  const latestGeo = useRef(geo);
  latestGeo.current = geo;
  useEffect(() => {
    const onMessage = (event: MessageEvent<FrameMessage>) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== "ready") return;
      send(latestGeo.current);
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, []);

  useEffect(() => send(geo), [geo]);

  useEffect(() => history.replaceState(null, "", formatPinHash(pin)), [pin]);
  useEffect(() => {
    const onHashChange = () => {
      const parsed = parsePinHash(location.hash);
      if (parsed) setPin(parsed);
    };
    addEventListener("hashchange", onHashChange);
    return () => removeEventListener("hashchange", onHashChange);
  }, []);

  const device = DEVICES[deviceIndex];

  return (
    <div className="jig">
      <PhoneFrame frameRef={frame} width={device.width} height={device.height} />
      <div className="jig__map-area">
        <PinMap
          pin={pin}
          overlays={overlays}
          onMove={(lon, lat) => setPin((p) => ({ ...p, lon, lat }))}
        />
        <form className="jig__controls" onSubmit={(e) => e.preventDefault()}>
          <label className="jig__field">
            <span>Location</span>
            <select value={source} onChange={(e) => setSource(e.currentTarget.value as Source)}>
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="jig__field">
            <span>Accuracy: {pin.accuracyMeters} m</span>
            <input
              type="range"
              min={1}
              max={MAX_ACCURACY_METERS}
              value={pin.accuracyMeters}
              onInput={(e) => {
                const accuracyMeters = Number(e.currentTarget.value);
                setPin((p) => ({ ...p, accuracyMeters }));
              }}
            />
          </label>
          <label className="jig__field">
            <span>Screen</span>
            <select
              value={deviceIndex}
              onChange={(e) => setDeviceIndex(Number(e.currentTarget.value))}
            >
              {DEVICES.map((d, i) => (
                <option key={d.label} value={i}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="jig__field jig__overlays">
            <legend>Map</legend>
            <label>
              <input
                type="checkbox"
                checked={overlays.zones}
                onChange={(e) => setOverlays((o) => ({ ...o, zones: e.currentTarget.checked }))}
              />
              Paid zones
              {Object.values(ZONE_CATEGORY).map((c) => (
                <span
                  key={c.label}
                  className="jig__swatch"
                  style={{ background: c.colorHex }}
                  title={c.label}
                />
              ))}
            </label>
            <label>
              <input
                type="checkbox"
                checked={overlays.cleaning}
                onChange={(e) => setOverlays((o) => ({ ...o, cleaning: e.currentTarget.checked }))}
              />
              Street cleaning
              <span className="jig__swatch" style={{ background: CLEANING_COLOR }} />
            </label>
          </fieldset>
          <p className="jig__coords">
            {pin.lat.toFixed(5)}, {pin.lon.toFixed(5)}
          </p>
          <p className="jig__hint">Click the map or drag the pin.</p>
        </form>
      </div>
    </div>
  );
}

interface PhoneFrameProps {
  frameRef: RefObject<HTMLIFrameElement>;
  width: number;
  height: number;
}

/**
 * The app at a real phone's size in CSS pixels, shrunk to fit when the window is shorter.
 * The iframe keeps its full size and is scaled as a whole, so the app lays out exactly as
 * it would on that phone.
 */
function PhoneFrame({ frameRef, width, height }: PhoneFrameProps) {
  const area = useRef<HTMLDivElement>(null);
  const [areaHeight, setAreaHeight] = useState(height);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setAreaHeight(entry.contentRect.height));
    observer.observe(area.current!);
    return () => observer.disconnect();
  }, []);

  const scale = Math.min(1, areaHeight / height);

  return (
    <div className="jig__phone-area" ref={area}>
      <div className="jig__phone" style={{ width: width * scale, height: height * scale }}>
        <iframe
          ref={frameRef}
          className="jig__frame"
          src="./frame.html"
          title="App"
          style={{ width, height, transform: `scale(${scale})` }}
        />
      </div>
    </div>
  );
}
