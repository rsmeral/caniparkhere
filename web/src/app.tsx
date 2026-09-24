import { useEffect, useMemo, useState } from "preact/hooks";
import "./app.css";
import { loadData, type LoadedData } from "./dataStore";
import { describe, type Display, type ZoneChip } from "./describe";
import { buildIndexes, isWithinBounds, queryStatus } from "./query";
import { useGeolocation } from "./useGeolocation";

const neutral = (icon: string, sentence: string): Display => ({
  tone: "neutral",
  icon,
  sentence,
  detail: null,
});

interface ZoneBoxProps {
  streetName?: string | null;
  zone?: ZoneChip | null;
  expanded: boolean;
  onToggle: () => void;
}

/** One "here's what we detected" card - a zone's identity plus the street it's on. Reused
 * once per candidate for an ambiguous location, each with the same streetName (the point
 * has exactly one nearest street regardless of which zone turns out to be right). */
function ZoneBox({ streetName, zone, expanded, onToggle }: ZoneBoxProps) {
  const canExpand = Boolean(zone?.expanded);
  return (
    <div className="app__detail">
      <div
        className="app__detail-info"
        role={canExpand ? "button" : undefined}
        tabIndex={canExpand ? 0 : undefined}
        aria-expanded={canExpand ? expanded : undefined}
        onClick={canExpand ? onToggle : undefined}
        onKeyDown={
          canExpand
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle();
                }
              }
            : undefined
        }
      >
        {streetName && <p className="app__detail-row app__detail-street">{streetName}</p>}
        {zone && (
          <p className="app__detail-row app__detail-zone">
            <span
              className="app__swatch"
              style={{ background: zone.colorHex }}
              title={`Curb color: ${zone.colorName}`}
            />
            <span className="app__detail-text">
              {zone.code} · {zone.categoryLabel}
            </span>
            {canExpand && <span className="app__detail-chevron">{expanded ? "▲" : "▼"}</span>}
          </p>
        )}
        {zone?.expanded && (
          // Stays mounted regardless of `expanded` - the CSS max-height transition on
          // .app__detail-expand-wrap needs the element present to animate between its
          // collapsed and open states.
          <div
            className={`app__detail-expand-wrap${expanded ? " app__detail-expand-wrap--open" : ""}`}
          >
            <dl className="app__detail-expanded">
              {zone.expanded.map((row) => (
                <div className="app__detail-expanded-row" key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
      {zone?.payment && (
        <a className="app__pay" href={zone.payment.url} target="_blank" rel="noopener noreferrer">
          <span className="app__pay-label">Pay</span>
          <span className="app__pay-price">{zone.payment.priceLabel}</span>
        </a>
      )}
    </div>
  );
}

export function App() {
  const geo = useGeolocation();
  const [data, setData] = useState<LoadedData | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  useEffect(() => {
    loadData()
      .then(setData)
      .catch((err) => setDataError((err as Error).message));
  }, []);

  const indexes = useMemo(() => (data ? buildIndexes(data) : null), [data]);

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
    if (!data || !indexes || geo.status === "searching") {
      return neutral("23f3", "Figuring out where you are..."); // ⏳
    }
    if (!isWithinBounds(data.bounds, geo.lon, geo.lat)) {
      return describe({ kind: "outOfArea" });
    }
    const result = queryStatus(data, indexes, geo.lon, geo.lat, undefined, geo.accuracyMeters);
    return describe(result.status, result.upcomingClosure);
  }, [data, indexes, geo, dataError]);

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
            <ZoneBox
              key={candidate.code}
              streetName={candidatesStreetName}
              zone={candidate}
              expanded={expandedCode === candidate.code}
              onToggle={() => toggleExpanded(candidate.code)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
