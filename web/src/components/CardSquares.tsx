import type { Card } from "../describe";

interface CardSquaresProps {
  cards: Card[];
  pickedKey: string | null;
  onPick: (key: string | null) => void;
}

/**
 * The cards, rolled up into a row of small squares while the map is open: each card's chip
 * with just a dot coloured by its verdict. Tapping one opens its card over the map; tapping it
 * again closes it.
 */
export function CardSquares({ cards, pickedKey, onPick }: CardSquaresProps) {
  return (
    <div className="app__squares">
      {cards.map((card) => {
        const picked = card.key === pickedKey;
        const name = [card.streetName, card.zone?.code].filter(Boolean).join(", ");
        return (
          <button
            type="button"
            key={card.key}
            className="app__detail app__square"
            aria-pressed={picked}
            aria-label={`${name}: ${card.advice.sentence}`}
            onClick={() => onPick(picked ? null : card.key)}
          >
            <span className={`app__square-dot app__square-dot--${card.verdict}`} />
          </button>
        );
      })}
    </div>
  );
}
