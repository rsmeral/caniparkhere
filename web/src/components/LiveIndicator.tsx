import { accuracyBars } from "../accuracy";
import type { GeoState } from "../useGeolocation";

interface LiveIndicatorProps {
  geo: GeoState;
  paused: boolean;
  onToggle: () => void;
}

/**
 * Whether the answer follows the phone, in the top left corner: "Live" with a pulsing dot
 * and signal bars for the fix's accuracy, "Paused" once tapped, which keeps the answer for
 * the spot it was paused at. Pausing needs a position to keep, so it waits for the first fix.
 */
export function LiveIndicator({ geo, paused, onToggle }: LiveIndicatorProps) {
  const ready = geo.status === "ready";
  const state = paused
    ? "paused"
    : ready
      ? "live"
      : geo.status === "searching"
        ? "searching"
        : "off";
  const label = { live: "Live", paused: "Paused", searching: "Locating...", off: "No location" }[
    state
  ];
  const bars = ready ? accuracyBars(geo.accuracyMeters) : 0;
  return (
    <button
      type="button"
      className={`app__live app__live--${state}`}
      onClick={onToggle}
      disabled={!ready}
      aria-pressed={paused}
      aria-label={paused ? "Paused. Follow my location again" : `${label}. Pause on this spot`}
    >
      <span className="app__live-dot" aria-hidden="true" />
      <span>{label}</span>
      {ready && (
        <span
          className="app__live-bars"
          aria-hidden="true"
          title={`About ${Math.round(geo.accuracyMeters)} m`}
        >
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={`app__live-bar${n <= bars ? " app__live-bar--on" : ""}`} />
          ))}
        </span>
      )}
    </button>
  );
}
