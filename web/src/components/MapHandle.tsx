interface MapHandleProps {
  open: boolean;
  /** Draws the eye to the map, for when the position is unclear. */
  nudge: boolean;
  onToggle: () => void;
}

const Chevron = () => (
  <svg viewBox="0 0 24 12" aria-hidden="true">
    <path
      d="M3 10l9-7 9 7"
      fill="none"
      stroke="currentColor"
      stroke-width="2.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

/**
 * "Map" under two stacked chevrons at the bottom of the screen, faded so it stays out of the
 * answer's way. It opens the map and closes it again, as a swipe up or down does; the chevrons
 * point the way the map will go. While nudging, they bump upwards now and then.
 */
export function MapHandle({ open, nudge, onToggle }: MapHandleProps) {
  const modifiers = `${open ? " app__map-handle--open" : ""}${nudge ? " app__map-handle--nudge" : ""}`;
  return (
    <button
      type="button"
      className={`app__map-handle${modifiers}`}
      aria-expanded={open}
      aria-label={open ? "Hide the map" : "Show the map"}
      onClick={onToggle}
    >
      <span className="app__map-handle-chevrons">
        <Chevron />
        <Chevron />
      </span>
      <span className="app__map-handle-label">Map</span>
    </button>
  );
}
