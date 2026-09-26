import type { Card } from "../describe";
import { ExpandedRows } from "./ExpandedRows";
import { PayLink } from "./PayLink";
import { ZoneSummary } from "./ZoneSummary";

interface ZoneBoxProps {
  card: Card;
  expanded: boolean;
  onToggle: () => void;
}

/** A card whose place agrees with the answer above - its street, zone and cleaning, its
 * price rows when it has any, and Pay as a full-height slice cut down the right edge. */
export function ZoneBox({ card, expanded, onToggle }: ZoneBoxProps) {
  const { zone } = card;
  return (
    <div className="app__detail">
      <ZoneSummary
        streetName={card.streetName}
        zone={zone}
        terms={card.terms}
        cleaning={card.cleaning}
        canExpand={Boolean(zone?.expanded)}
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
