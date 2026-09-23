import { useEffect, useMemo, useState } from "preact/hooks";
import "./app.css";
import { loadData, type LoadedData } from "./dataStore";
import { describe, type Display } from "./describe";
import { buildIndexes, isWithinBounds, queryStatus } from "./query";
import { useGeolocation } from "./useGeolocation";

const neutral = (icon: string, sentence: string): Display => ({
  tone: "neutral",
  icon,
  sentence,
  detail: null,
});

export function App() {
  const geo = useGeolocation();
  const [data, setData] = useState<LoadedData | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

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
    const result = queryStatus(data, indexes, geo.lon, geo.lat);
    return describe(result.status, result.upcomingClosure);
  }, [data, indexes, geo, dataError]);

  const zone = display.detail?.zone ?? null;
  const canExpand = Boolean(zone?.expanded);

  // Collapse back down whenever the underlying spot changes, so an expanded card from a
  // previous location doesn't linger after moving to a new one.
  useEffect(() => {
    setExpanded(false);
  }, [display.detail?.streetName, zone?.code]);

  const toggleExpanded = () => setExpanded((e) => !e);

  return (
    <div className={`app app--${display.tone}`}>
      <div className="app__emoji-halo">
        <img className="app__emoji" src={`/emoji/${display.icon}.svg`} alt="" />
      </div>
      <p className="app__sentence">{display.sentence}</p>
      {display.detail && (
        <div className="app__detail">
          <div
            className="app__detail-info"
            role={canExpand ? "button" : undefined}
            tabIndex={canExpand ? 0 : undefined}
            aria-expanded={canExpand ? expanded : undefined}
            onClick={canExpand ? toggleExpanded : undefined}
            onKeyDown={
              canExpand
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleExpanded();
                    }
                  }
                : undefined
            }
          >
            {display.detail.streetName && (
              <p className="app__detail-row app__detail-street">{display.detail.streetName}</p>
            )}
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
              // Always mounted (not conditional on `expanded`) - the CSS transition on
              // .app__detail-expand-wrap animates between its collapsed and open grid-row
              // sizes, which only works on an element that's actually present to animate.
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
            <a
              className="app__pay"
              href={zone.payment.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="app__pay-label">Pay</span>
              <span className="app__pay-price">{zone.payment.priceLabel}</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
