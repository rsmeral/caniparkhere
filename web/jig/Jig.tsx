import type { RefObject } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ZONE_CATEGORY } from "../src/describe";
import { WARNING_WINDOW_DAYS } from "../src/query";
import type { GeoState } from "../src/useGeolocation";
import { PinMap } from "./PinMap";
import type { FrameMessage, JigMessage } from "./protocol";
import {
  DEFAULT_SCENARIO,
  formatScenarioHash,
  parseScenarioHash,
  type Pin,
  shiftLocalTime,
  toLocalTime,
} from "./scenario";
import { CLEANING_COLORS, type Overlays } from "./zoneLayers";

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

const TIME_STEPS = [
  { label: "−1 h", minutes: -60 },
  { label: "+1 h", minutes: 60 },
  { label: "+1 day", minutes: 24 * 60 },
];

const initialScenario = parseScenarioHash(location.hash) ?? DEFAULT_SCENARIO;

export function Jig() {
  const [pin, setPin] = useState<Pin>(initialScenario.pin);
  // Null follows the real clock; a local `YYYY-MM-DDTHH:MM` pins the app to that moment.
  const [time, setTime] = useState<string | null>(initialScenario.time);
  const [source, setSource] = useState<Source>("pin");
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [overlays, setOverlays] = useState<Overlays>({ zones: true, cleaning: false });
  const [cleaningEverywhereToday, setCleaningEverywhereToday] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  const geo: GeoState = useMemo(
    () =>
      source === "pin"
        ? { status: "ready", lon: pin.lon, lat: pin.lat, accuracyMeters: pin.accuracyMeters }
        : { status: source },
    [pin, source],
  );

  const message: JigMessage = useMemo(
    () => ({
      type: "show",
      geo,
      at: time === null ? null : new Date(time).getTime(),
      cleaningEverywhereToday,
    }),
    [geo, time, cleaningEverywhereToday],
  );
  const send = (m: JigMessage) => frame.current?.contentWindow?.postMessage(m, location.origin);

  // The frame announces itself on every load, including reloads from a code change, and
  // gets what to show in reply.
  const latestMessage = useRef(message);
  latestMessage.current = message;
  useEffect(() => {
    const onMessage = (event: MessageEvent<FrameMessage>) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== "ready") return;
      send(latestMessage.current);
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, []);

  useEffect(() => send(message), [message]);

  useEffect(() => history.replaceState(null, "", formatScenarioHash({ pin, time })), [pin, time]);
  useEffect(() => {
    const onHashChange = () => {
      const parsed = parseScenarioHash(location.hash);
      if (!parsed) return;
      setPin(parsed.pin);
      setTime(parsed.time);
    };
    addEventListener("hashchange", onHashChange);
    return () => removeEventListener("hashchange", onHashChange);
  }, []);

  const device = DEVICES[deviceIndex];
  // The day the app is answering for, which is the one the map shows street cleaning for.
  const day = (time ?? toLocalTime(new Date())).slice(0, 10);

  return (
    <div className="jig">
      <PhoneFrame frameRef={frame} width={device.width} height={device.height} />
      <div className="jig__map-area">
        <PinMap
          pin={pin}
          overlays={overlays}
          cleaningDay={{ day, everywhere: cleaningEverywhereToday }}
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
          <TimeControl time={time} onChange={setTime} />
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
            </label>
            {overlays.cleaning && (
              <div className="jig__legend">
                <span>
                  <span className="jig__swatch" style={{ background: CLEANING_COLORS.today }} />
                  that day
                </span>
                <span>
                  <span className="jig__swatch" style={{ background: CLEANING_COLORS.soon }} />
                  within {WARNING_WINDOW_DAYS} days
                </span>
                <span>
                  <span className="jig__swatch" style={{ background: CLEANING_COLORS.later }} />
                  later
                </span>
              </div>
            )}
          </fieldset>
          <fieldset className="jig__field jig__overlays">
            <legend>Simulate</legend>
            <label>
              <input
                type="checkbox"
                checked={cleaningEverywhereToday}
                onChange={(e) => setCleaningEverywhereToday(e.currentTarget.checked)}
              />
              Street cleaning everywhere that day
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

interface TimeControlProps {
  time: string | null;
  onChange(time: string | null): void;
}

/**
 * Real time, or a set moment to see what the app says then. Times are in this computer's
 * time zone, which is also the one the app reads tariff hours in.
 */
function TimeControl({ time, onChange }: TimeControlProps) {
  // Ticks while following the real clock, so the disabled input shows the time the app is
  // answering for.
  const [clock, setClock] = useState(() => toLocalTime(new Date()));
  useEffect(() => {
    if (time !== null) return;
    const timer = setInterval(() => setClock(toLocalTime(new Date())), 10_000);
    return () => clearInterval(timer);
  }, [time]);

  const shown = time ?? clock;
  const weekday = new Date(shown).toLocaleDateString("en-GB", { weekday: "long" });

  return (
    <fieldset className="jig__field jig__time">
      <legend>Time</legend>
      <div className="jig__time-modes">
        <label>
          <input type="radio" checked={time === null} onChange={() => onChange(null)} />
          Now
        </label>
        <label>
          <input type="radio" checked={time !== null} onChange={() => onChange(clock)} />
          Custom
        </label>
      </div>
      <div className="jig__time-row">
        <input
          type="datetime-local"
          value={shown}
          disabled={time === null}
          onInput={(e) => {
            // An input cleared with its own reset button has no value to answer for.
            if (e.currentTarget.value) onChange(e.currentTarget.value);
          }}
        />
        <span>{weekday}</span>
      </div>
      <div className="jig__time-steps">
        {TIME_STEPS.map((step) => (
          <button
            key={step.label}
            type="button"
            onClick={() => onChange(shiftLocalTime(shown, step.minutes))}
          >
            {step.label}
          </button>
        ))}
      </div>
    </fieldset>
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
