import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import "./app.css";
import { describe, type CandidateZone, type Display, type ZoneChip } from "./describe";
import type { QueryResult } from "./query";
import { createQueryClient } from "./queryClient";
import { useGeolocation } from "./useGeolocation";

const neutral = (icon: string, sentence: string): Display => ({
  tone: "neutral",
  icon,
  sentence,
  detail: null,
});

/** The price/cap/hours rows a zone reveals when its card is open. */
function ExpandedRows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="app__detail-expanded">
      {rows.map((row) => (
        <div className="app__detail-expanded-row" key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PayLink({ payment, block }: { payment: NonNullable<ZoneChip["payment"]>; block?: boolean }) {
  return (
    <a
      className={`app__pay${block ? " app__pay--block" : ""}`}
      href={payment.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="app__pay-label">Pay</span>
      <span className="app__pay-price">{payment.priceLabel}</span>
    </a>
  );
}

interface ZoneSummaryProps {
  streetName?: string | null;
  zone?: ZoneChip | null;
  canExpand: boolean;
  expanded: boolean;
  onToggle: () => void;
  children?: ComponentChildren;
}

/** The dark "here's what we detected" row - the street name plus the zone's own code and
 * curb colour - and the control that opens whatever the card reveals. */
function ZoneSummary({
  streetName,
  zone,
  canExpand,
  expanded,
  onToggle,
  children,
}: ZoneSummaryProps) {
  return (
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
      {children}
    </div>
  );
}

interface ZoneBoxProps {
  streetName?: string | null;
  zone?: ZoneChip | null;
  expanded: boolean;
  onToggle: () => void;
}

/** The card under a confident answer - the zone's identity, its price rows when it has
 * any, and Pay as a full-height slice cut down the right edge. */
function ZoneBox({ streetName, zone, expanded, onToggle }: ZoneBoxProps) {
  const canExpand = Boolean(zone?.expanded);
  return (
    <div className="app__detail">
      <ZoneSummary
        streetName={streetName}
        zone={zone}
        canExpand={canExpand}
        expanded={expanded}
        onToggle={onToggle}
      >
        {zone?.expanded && (
          // Stays mounted regardless of `expanded` - the CSS max-height transition on
          // .app__detail-expand-wrap needs the element present to animate between its
          // collapsed and open states.
          <div
            className={`app__detail-expand-wrap${expanded ? " app__detail-expand-wrap--open" : ""}`}
          >
            <ExpandedRows rows={zone.expanded} />
          </div>
        )}
      </ZoneSummary>
      {zone?.payment && <PayLink payment={zone.payment} />}
    </div>
  );
}

interface CandidateBoxProps {
  streetName: string | null;
  candidate: CandidateZone;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * One candidate for an ambiguous location. Tapping it opens that zone's own answer - the
 * tone, emoji and recommendation the main screen would show had the fix landed on it - so
 * an ambiguous result stays somewhere the user can act from. Every candidate opens,
 * including a permit-only zone with no price rows to show.
 *
 * The parts stack rather than sharing a row, which lets the panel span the card's full
 * width and keeps Pay a normal button inside it instead of a slice stretched to the height
 * of the opened card.
 */
function CandidateBox({ streetName, candidate, expanded, onToggle }: CandidateBoxProps) {
  return (
    <div className="app__detail app__detail--resolvable">
      <div className="app__detail-summary">
        <ZoneSummary
          streetName={streetName}
          zone={candidate}
          canExpand
          expanded={expanded}
          onToggle={onToggle}
        />
      </div>
      <div className={`app__resolve-wrap${expanded ? " app__resolve-wrap--open" : ""}`}>
        {/* The inset keeps a margin of the card's own dark chip around the panel, so the
            tone colour reads as a distinct card however closely it matches the page behind
            it - resident-zone orange on the ambiguous screen's orange, for instance. */}
        <div className="app__resolve-inset">
          <div className={`app__resolve app__resolve--${candidate.tone}`}>
            <img className="app__resolve-emoji" src={`/emoji/${candidate.icon}.svg`} alt="" />
            <p className="app__resolve-sentence">{candidate.sentence}</p>
            {candidate.expanded && <ExpandedRows rows={candidate.expanded} />}
            {candidate.payment && <PayLink payment={candidate.payment} block />}
          </div>
        </div>
      </div>
    </div>
  );
}

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
