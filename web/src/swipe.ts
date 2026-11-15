export interface Point {
  x: number;
  y: number;
}

// A swipe has to cover this much of the screen's height, and at least this many pixels, so
// a scroll or a sloppy tap isn't taken for one.
const MIN_SHARE_OF_HEIGHT = 0.2;
const MIN_PIXELS = 80;
// And it has to be mostly vertical: sideways by at most this share of its height.
const MAX_SLANT = 0.5;

/**
 * Which way a touch from `start` to `end` swiped, if it was a long, mostly vertical swipe.
 *
 * @example swipeDirection({x:100, y:700}, {x:110, y:400}, 800) -> "up"
 * @example swipeDirection({x:100, y:700}, {x:110, y:650}, 800) -> null
 */
export function swipeDirection(
  start: Point,
  end: Point,
  screenHeight: number,
): "up" | "down" | null {
  const dy = end.y - start.y;
  const dx = end.x - start.x;
  if (Math.abs(dy) < Math.max(MIN_PIXELS, screenHeight * MIN_SHARE_OF_HEIGHT)) return null;
  if (Math.abs(dx) > Math.abs(dy) * MAX_SLANT) return null;
  return dy < 0 ? "up" : "down";
}
