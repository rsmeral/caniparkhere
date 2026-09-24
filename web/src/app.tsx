import { useEffect, useMemo, useState } from "preact/hooks";
import "./app.css";
import { CandidateBox } from "./components/CandidateBox";
import { ZoneBox } from "./components/ZoneBox";
import { describe, type Display } from "./describe";
import type { QueryResult } from "./query";
import { createQueryClient } from "./queryClient";
import { useGeolocation } from "./useGeolocation";
import { useThemeColor } from "./useThemeColor";

const neutral = (icon: string, sentence: string): Display => ({
  tone: "neutral",
  icon,
  sentence,
  detail: null,
});

export function App() {
  const geo = useGeolocation();
  // Spinning the worker up on first render starts its data load immediately, alongside the
  // browser's search for a GPS fix.
  const client = useMemo(() => createQueryClient(), []);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  useEffect(() => () => client.terminate(), [client]);

  // Each fix is resolved by the worker. `live` drops an answer whose location has already
  // been superseded, since replies can land in a different order than they were asked for.
  useEffect(() => {
    if (geo.status !== "ready") return;
    let live = true;
    client
      .query(geo.lon, geo.lat, geo.accuracyMeters)
      .then((r) => {
        if (live) setResult(r);
      })
      .catch((err) => {
        if (live) setDataError((err as Error).message);
      });
    return () => {
      live = false;
    };
  }, [client, geo]);

  const display: Display = useMemo(() => {
    if (dataError) return neutral("1f635", `Couldn't load zone data: ${dataError}`); // 😵
    if (geo.status === "unsupported") {
      return neutral("1f937", "This device can't share its location."); // 🤷
    }
    if (geo.status === "denied") {
      return neutral(
        "1f512",
        "Location is turned off. Allow it for this site to see what applies here.",
      ); // 🔒
    }
    if (geo.status === "unavailable") {
      return neutral(
        "1f6f0",
        "Still can't get a location fix. Try moving somewhere with a clearer view of the sky.",
      ); // 🛰
    }
    if (geo.status === "searching" || !result) {
      return neutral("23f3", "Figuring out where you are..."); // ⏳
    }
    return describe(result.status, result.upcomingClosure);
  }, [result, geo, dataError]);

  useThemeColor(display.tone);

  const zone = display.detail?.zone ?? null;
  const candidates = display.detail?.candidateZones ?? null;
  const candidatesStreetName = display.detail?.streetName ?? null;
  const candidatesKey = candidates?.map((c) => c.code).join(",") ?? null;

  // Collapse back down whenever the underlying spot (or its set of candidate zones)
  // changes, so an expanded card from a previous location doesn't linger after moving.
  useEffect(() => {
    setExpandedCode(null);
  }, [display.detail?.streetName, zone?.code, candidatesKey]);

  const toggleExpanded = (code: string) =>
    setExpandedCode((current) => (current === code ? null : code));

  return (
    <div className={`app app--${display.tone}`}>
      <div className="app__emoji-halo">
        <img className="app__emoji" src={`/emoji/${display.icon}.svg`} alt="" />
      </div>
      <p className="app__sentence">{display.sentence}</p>
      {display.detail && !candidates && (
        <ZoneBox
          streetName={display.detail.streetName}
          zone={zone}
          expanded={expandedCode === (zone?.code ?? "single")}
          onToggle={() => toggleExpanded(zone?.code ?? "single")}
        />
      )}
      {candidates && candidates.length > 0 && (
        <div className="app__candidates">
          {candidates.map((candidate) => (
            <CandidateBox
              key={candidate.code}
              streetName={candidatesStreetName}
              candidate={candidate}
              expanded={expandedCode === candidate.code}
              onToggle={() => toggleExpanded(candidate.code)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
