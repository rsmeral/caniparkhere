import { useEffect, useMemo, useState } from "preact/hooks";
import "./app.css";
import { AboutButton } from "./components/About";
import { CandidateBox } from "./components/CandidateBox";
import { LiveIndicator } from "./components/LiveIndicator";
import { VehiclePicker } from "./components/VehiclePicker";
import { ZoneBox } from "./components/ZoneBox";
import { describe, type Display } from "./describe";
import { emojiUrl } from "./emoji";
import type { QueryResult } from "./query";
import { createQueryClient } from "./queryClient";
import type { GeoState } from "./useGeolocation";
import { useThemeColor } from "./useThemeColor";
import { loadVehicle, saveVehicle, type Vehicle } from "./vehicle";

const neutral = (icon: string, sentence: string): Display => ({
  tone: "neutral",
  icon,
  sentence,
  cards: [],
  agree: true,
});

interface Props {
  geo: GeoState;
  /** The moment to answer for. Left out, each answer is for the time it's worked out. */
  now?: Date;
  /** Treat every street-cleaning section as cleaned today. For simulating in the jig. */
  cleaningEverywhereToday?: boolean;
  /** Told when the user pauses or resumes following the location, so the caller can stop
   * and restart whatever supplies it. */
  onPausedChange?: (paused: boolean) => void;
}

/**
 * The whole screen, for whatever location and time it's given. Where those come from is up
 * to the caller: the browser's GPS and clock in the real app, or the controls in the jig.
 */
export function App({ geo: liveGeo, now, cleaningEverywhereToday = false, onPausedChange }: Props) {
  // Spinning the worker up on first render starts its data load immediately, alongside the
  // browser's search for a GPS fix.
  const client = useMemo(() => createQueryClient(), []);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle>(loadVehicle);
  // While paused, the answer stays with the position it was paused at - where the car is,
  // once the user walks away from it.
  const [pausedGeo, setPausedGeo] = useState<GeoState | null>(null);
  const geo = pausedGeo ?? liveGeo;

  const togglePaused = () => {
    const pausing = pausedGeo === null;
    setPausedGeo(pausing ? liveGeo : null);
    onPausedChange?.(pausing);
  };

  const pickVehicle = (picked: Vehicle) => {
    setVehicle(picked);
    saveVehicle(picked);
  };

  useEffect(() => () => client.terminate(), [client]);

  // The effect below depends on the timestamp, not the Date, so a new Date for the same
  // moment doesn't ask again.
  const nowMs = now?.getTime();

  // Each fix is resolved by the worker. `live` drops an answer whose location has already
  // been superseded, since replies can land in a different order than they were asked for.
  useEffect(() => {
    if (geo.status !== "ready") return;
    let live = true;
    client
      .query(geo.lon, geo.lat, geo.accuracyMeters, { at: now, cleaningEverywhereToday })
      .then((r) => {
        if (live) setResult(r);
      })
      .catch((err) => {
        if (live) setDataError((err as Error).message);
      });
    return () => {
      live = false;
    };
  }, [client, geo, nowMs, cleaningEverywhereToday]);

  const display: Display = useMemo(() => {
    if (dataError) return neutral("😵", `Couldn't load zone data: ${dataError}`);
    if (geo.status === "unsupported") {
      return neutral("🤷", "This device can't share its location.");
    }
    if (geo.status === "denied") {
      return neutral(
        "🔒",
        "Location is turned off. Allow it for this site to see what applies here.",
      );
    }
    if (geo.status === "unavailable") {
      return neutral(
        "🛰",
        "Still can't get a location fix. Try moving somewhere with a clearer view of the sky.",
      );
    }
    if (geo.status === "searching" || !result) {
      return neutral("⏳", "Figuring out where you are...");
    }
    return describe(result, vehicle);
  }, [result, geo, dataError, vehicle]);

  useThemeColor(display.tone);

  const cardsKey = display.cards.map((c) => c.key).join(",");

  // Collapse back down whenever the set of cards changes, so an expanded card from a
  // previous location doesn't linger after moving.
  useEffect(() => {
    setExpandedKey(null);
  }, [cardsKey]);

  const toggleExpanded = (key: string) =>
    setExpandedKey((current) => (current === key ? null : key));

  return (
    <div className={`app app--${display.tone}`}>
      <LiveIndicator geo={geo} paused={pausedGeo !== null} onToggle={togglePaused} />
      <div className="app__corner">
        <VehiclePicker vehicle={vehicle} onChange={pickVehicle} />
        <AboutButton />
      </div>
      <div className="app__emoji-halo">
        <img className="app__emoji" src={emojiUrl(display.icon)} alt="" />
      </div>
      <p className="app__sentence">{display.sentence}</p>
      {display.cards.length > 0 && (
        <div className="app__cards">
          {display.cards.map((card) => {
            const Box = display.agree ? ZoneBox : CandidateBox;
            return (
              <Box
                key={card.key}
                card={card}
                expanded={expandedKey === card.key}
                onToggle={() => toggleExpanded(card.key)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
