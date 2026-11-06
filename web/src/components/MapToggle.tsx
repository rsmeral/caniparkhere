interface MapToggleProps {
  open: boolean;
  onToggle: () => void;
}

/** A folded paper map. */
const MapIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <path stroke-linejoin="round" d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5Z" />
    <path d="M9 4v13.5M15 6.5V20" />
  </svg>
);

/** Two cards, one over the other. */
const CardsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="6" rx="1.8" />
    <rect x="3.5" y="13" width="17" height="6" rx="1.8" />
  </svg>
);

/** A tab on the right edge of the screen that swaps the cards for the map and back. It shows
 * what it switches to. */
export function MapToggle({ open, onToggle }: MapToggleProps) {
  return (
    <button
      type="button"
      className="app__map-toggle"
      aria-label={open ? "Show the cards" : "Show the map"}
      onClick={onToggle}
    >
      {open ? <CardsIcon /> : <MapIcon />}
    </button>
  );
}
