import { useEffect, useState } from "preact/hooks";

export type GeoState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; lon: number; lat: number };

export function useGeolocation(): GeoState {
  const [state, setState] = useState<GeoState>({ status: "loading" });

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({ status: "error", message: "Geolocation isn't supported on this device." });
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setState({ status: "ready", lon: pos.coords.longitude, lat: pos.coords.latitude }),
      (err) => setState({ status: "error", message: err.message }),
      { enableHighAccuracy: true, maximumAge: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return state;
}
