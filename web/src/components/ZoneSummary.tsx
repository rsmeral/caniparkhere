import type { ComponentChildren } from "preact";
import type { Card, ZoneChip } from "../describe";

interface ZoneSummaryProps {
  streetName?: string | null;
  zone?: ZoneChip | null;
  terms?: string | null;
  cleaning?: Card["cleaning"];
  canExpand: boolean;
  expanded: boolean;
  onToggle: () => void;
  children?: ComponentChildren;
}

/** The dark "here's what we detected" row - the street name, then the zone's curb colour,
 * code and terms on one line, and any street cleaning there - and the control that opens
 * whatever the card reveals. */
export function ZoneSummary({
  streetName,
  zone,
  terms,
  cleaning,
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
          {/* A long line wraps between the terms' parts, or before "until", never inside a
              price, a time or a limit. */}
          <span>
            <span className="app__detail-part">{zone.code}</span>
            {terms?.split(" · ").map((part) => (
              <>
                {" · "}
                {part.split(/ (?=until )/).map((piece, i) => (
                  <>
                    {i > 0 && " "}
                    <span className="app__detail-part">{piece}</span>
                  </>
                ))}
              </>
            ))}
          </span>
          {canExpand && <span className="app__detail-chevron">{expanded ? "▲" : "▼"}</span>}
        </p>
      )}
      {cleaning && (
        <p
          className={`app__detail-row app__detail-cleaning${cleaning.today ? " app__detail-cleaning--today" : ""}`}
        >
          {cleaning.label}
        </p>
      )}
      {children}
    </div>
  );
}
