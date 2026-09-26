import { useEffect, useRef, useState } from "preact/hooks";
import { classifyGeoError } from "./geoError";

export type GeoState =
  | { status: "searching" }
  | { status: "unsupported" }
  | { status: "denied" }
  | { status: "unavailable" }
  | { status: "ready"; lon: number; lat: number; accuracyMeters: number };

// How long to tolerate transient "no fix yet" errors before telling the user something's
// wrong. The watch keeps running throughout, so a late fix still recovers the UI.
const GIVE_UP_MS = 20_000;

/**
 * Follows the device's position. While `paused`, the watch is stopped and the last state
 * stays as it was; resuming starts a new watch.
 */
export function useGeolocation(paused = false): GeoState {
  const [state, setState] = useState<GeoState>({ status: "searching" });
  const hasFix = useRef(false);
  const giveUpTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (paused) return;
    if (!navigator.geolocation) {
      setState({ status: "unsupported" });
      return;
    }

    const clearGiveUp = () => {
      if (giveUpTimer.current !== undefined) {
        clearTimeout(giveUpTimer.current);
        giveUpTimer.current = undefined;
      }
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        hasFix.current = true;
        clearGiveUp();
        setState({
          status: "ready",
          lon: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracyMeters: pos.coords.accuracy,
        });
      },
      (err) => {
        switch (classifyGeoError(err.code, hasFix.current)) {
          case "denied":
            hasFix.current = false;
            clearGiveUp();
            setState({ status: "denied" });
            return;
          case "keep":
            // Already showing a position - a transient blip shouldn't blank out a good answer.
            return;
          case "wait":
            if (giveUpTimer.current === undefined) {
              giveUpTimer.current = setTimeout(
                () => setState({ status: "unavailable" }),
                GIVE_UP_MS,
              );
            }
            return;
        }
      },
      { enableHighAccuracy: true, maximumAge: 15_000 },
    );

    return () => {
      clearGiveUp();
      navigator.geolocation.clearWatch(watchId);
    };
  }, [paused]);

  return state;
}
