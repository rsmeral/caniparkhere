import { useEffect } from "preact/hooks";
import type { Tone } from "./describe";

/**
 * Keeps the theme-color meta in step with the tone on screen, so the browser UI around an
 * open tab blends into a background that runs edge to edge.
 *
 * This reaches the browser's own chrome only. An installed window takes its status bar
 * from the manifest's theme_color, which is fixed for the life of the install and so reads
 * as chrome rather than as any one tone.
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
