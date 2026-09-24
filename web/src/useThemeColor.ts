import { useEffect } from "preact/hooks";
import type { Tone } from "./describe";

/**
 * Keeps the theme-color meta in step with the tone on screen. A browser paints the status
 * bar with it in standalone mode, and the app's background is a full-bleed tone that
 * changes with the answer - so a fixed colour leaves a band across the top of every screen
 * whose tone it doesn't happen to match.
 *
 * The colour is read from the same custom property the background uses, so the two can't
 * fall out of step.
 */
export function useThemeColor(tone: Tone): void {
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const colour = getComputedStyle(document.documentElement)
      .getPropertyValue(`--tone-${tone}`)
      .trim();
    if (colour) meta.setAttribute("content", colour);
  }, [tone]);
}
