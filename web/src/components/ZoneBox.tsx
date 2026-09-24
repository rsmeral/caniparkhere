import type { ZoneChip } from "../describe";
import { ExpandedRows } from "./ExpandedRows";
import { PayLink } from "./PayLink";
import { ZoneSummary } from "./ZoneSummary";

interface ZoneBoxProps {
  streetName?: string | null;
  zone?: ZoneChip | null;
  expanded: boolean;
  onToggle: () => void;
}

/** The card under a confident answer - the zone's identity, its price rows when it has
 * any, and Pay as a full-height slice cut down the right edge. */
export function ZoneBox({ streetName, zone, expanded, onToggle }: ZoneBoxProps) {
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
