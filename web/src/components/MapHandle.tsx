import { useEffect, useRef } from "preact/hooks";

interface MapHandleProps {
  open: boolean;
  /** Draws the eye to the map, for when the position is unclear. */
  nudge: boolean;
  onToggle: () => void;
}

// Each chevron is two strokes meeting at a middle point, with fixed ends. The middle point's
// height, in the 24 × 12 box: above the ends pointing up, below them pointing down.
const MIDDLE_UP = 1.5;
const MIDDLE_DOWN = 10.5;
const BEND_MS = 300;

const chevron = (middle: number) => `M3 6L12 ${middle}L21 6`;

/** Eases in and out, for t from 0 to 1. */
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * "Map" under two stacked chevrons at the bottom of the screen, faded so it stays out of the
 * answer's way. It opens the map and closes it again, as a swipe up or down does; the chevrons
 * point the way the map will go. Turning round, they bend flat and out the other way, at the
 * same thickness, as only their middle point moves. While nudging, they bump upwards now and
 * then.
 */
export function MapHandle({ open, nudge, onToggle }: MapHandleProps) {
  const paths = useRef<(SVGPathElement | null)[]>([]);
  const middle = useRef(open ? MIDDLE_DOWN : MIDDLE_UP);

  // The bend is drawn frame by frame: browsers differ on animating a path's shape in CSS.
  useEffect(() => {
    const from = middle.current;
    const to = open ? MIDDLE_DOWN : MIDDLE_UP;
    const draw = (y: number) => {
      middle.current = y;
      for (const path of paths.current) path?.setAttribute("d", chevron(y));
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      draw(to);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / BEND_MS);
      draw(from + (to - from) * easeInOut(t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const modifiers = nudge ? " app__map-handle--nudge" : "";
  return (
    <button
      type="button"
      className={`app__map-handle${modifiers}`}
      aria-expanded={open}
      aria-label={open ? "Hide the map" : "Show the map"}
      onClick={onToggle}
    >
      <span className="app__map-handle-chevrons" aria-hidden="true">
        {[0, 1].map((i) => (
          <svg key={i} viewBox="0 0 24 12">
            <path
              ref={(el) => {
                paths.current[i] = el;
              }}
              d={chevron(middle.current)}
              fill="none"
              stroke="currentColor"
              stroke-width="2.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        ))}
      </span>
      <span className="app__map-handle-label">Map</span>
    </button>
  );
}
