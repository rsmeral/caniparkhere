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

/** The dark "here's what we detected" row - the street name, the zone's own code and curb
 * colour, its terms, and any street cleaning there - and the control that opens whatever the
 * card reveals. */
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
          <span className="app__detail-text">
            {zone.code} · {zone.categoryLabel}
          </span>
          {canExpand && <span className="app__detail-chevron">{expanded ? "▲" : "▼"}</span>}
        </p>
      )}
      {terms && <p className="app__detail-row app__detail-terms">{terms}</p>}
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
