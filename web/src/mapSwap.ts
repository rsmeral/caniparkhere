/**
 * The motion of swapping the cards for the map and back, with the Web Animations API. Only
 * movement, scale and opacity are animated, which browsers run smoothly however busy the
 * page is, such as while the map loads.
 *
 * What leaves moves a little in the swipe's direction as it fades out; what arrives moves
 * the same way into place as it fades in. Whatever stays, such as the emoji and the
 * sentence, moves and scales from where it was to where it goes.
 */

const EXIT_MS = 160;
const ENTER_MS = 320;
const EXIT_PX = 16;
const ENTER_PX = 28;
const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** Fades the elements out, moving them up (direction -1) or down (1). */
export function fadeOut(elements: Element[], direction: -1 | 1): Promise<unknown> {
  return Promise.all(
    elements.map(
      (el) =>
        el.animate(
          [
            { opacity: 1, translate: "0 0" },
            { opacity: 0, translate: `0 ${direction * EXIT_PX}px` },
          ],
          { duration: EXIT_MS, easing: "ease-in", fill: "forwards" },
        ).finished,
    ),
  );
}

/** Fades the elements in, moving up (direction -1) or down (1) into place. */
export function fadeIn(elements: Element[], direction: -1 | 1): void {
  for (const el of elements) {
    el.animate(
      [
        { opacity: 0, translate: `0 ${-direction * ENTER_PX}px` },
        { opacity: 1, translate: "0 0" },
      ],
      { duration: ENTER_MS, easing: EASE_OUT },
    );
  }
}

/**
 * Moves the element from `first`, where it was before the layout changed, to where it is now.
 * With `scale`, it also grows or shrinks from its top left corner to its new width; without,
 * it keeps whatever transform it has of its own.
 */
export function moveFrom(el: Element, first: DOMRect, scale: boolean): void {
  const last = el.getBoundingClientRect();
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  const ratio = scale && last.width > 0 ? first.width / last.width : 1;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(ratio - 1) < 0.01) return;
  const origin = scale ? { transformOrigin: "0 0" } : {};
  el.animate(
    [
      { translate: `${dx}px ${dy}px`, scale: `${ratio}`, ...origin },
      { translate: "0 0", scale: "1", ...origin },
    ],
    { duration: ENTER_MS, easing: EASE_OUT },
  );
}
