import type { Card } from "../describe";
import { emojiUrl } from "../emoji";
import { ExpandedRows } from "./ExpandedRows";
import { PayLink } from "./PayLink";
import { ZoneSummary } from "./ZoneSummary";

interface CandidateBoxProps {
  card: Card;
  expanded: boolean;
  /** Left out, the card can't be opened or closed by tapping it, as over the map. */
  onToggle?: () => void;
  /** Given, a large cross in the card's top right corner closes it, as over the map. */
  onClose?: () => void;
}

/**
 * A card whose place differs from the others. Tapping it opens that place's own answer - the
 * tone, emoji and recommendation the main screen would show had it been the only place - so
 * an uncertain result stays somewhere the user can act from. Every card opens, including a
 * permit-only zone with no price rows to show.
 *
 * The parts stack rather than sharing a row, which lets the panel span the card's full
 * width and keeps Pay a normal button inside it instead of a slice stretched to the height
 * of the opened card.
 */
export function CandidateBox({ card, expanded, onToggle, onClose }: CandidateBoxProps) {
  const { zone, advice } = card;
  return (
    <div
      className={`app__detail app__detail--resolvable${onClose ? " app__detail--closable" : ""}`}
    >
      <div className="app__detail-summary">
        <ZoneSummary
          streetName={card.streetName}
          zone={zone}
          terms={card.terms}
          cleaning={card.cleaning}
          canExpand={onToggle !== undefined}
          expanded={expanded}
          onToggle={onToggle ?? (() => {})}
        />
      </div>
      <div className={`app__resolve-wrap${expanded ? " app__resolve-wrap--open" : ""}`}>
        {/* The inset keeps a margin of the card's own dark chip around the panel, so the
            tone colour reads as a distinct card however closely it matches the page behind
            it - resident-zone orange on the ambiguous screen's orange, for instance. */}
        <div className="app__collapse-inner">
          <div className="app__resolve-inset">
            <div className={`app__resolve app__resolve--${advice.tone}`}>
              <img className="app__resolve-emoji" src={emojiUrl(advice.icon)} alt="" />
              <p className="app__resolve-sentence">{advice.sentence}</p>
              {zone?.expanded && <ExpandedRows rows={zone.expanded} />}
              {zone?.payment && <PayLink payment={zone.payment} block />}
            </div>
          </div>
        </div>
      </div>
      {onClose && (
        <button type="button" className="app__detail-close" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              stroke-width="2.6"
              stroke-linecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
