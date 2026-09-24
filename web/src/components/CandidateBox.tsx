import type { CandidateZone } from "../describe";
import { ExpandedRows } from "./ExpandedRows";
import { PayLink } from "./PayLink";
import { ZoneSummary } from "./ZoneSummary";

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
export function CandidateBox({ streetName, candidate, expanded, onToggle }: CandidateBoxProps) {
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
