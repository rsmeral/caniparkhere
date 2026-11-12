import { type RefObject } from "preact";
import { useEffect } from "preact/hooks";

/**
 * Marks a scrolling element with `--more-above` and `--more-below` modifiers of `block` while
 * there's more of it to scroll to that way, so its edges can fade out there (see
 * .app__cards in app.css). Kept up to date as it scrolls and as it or its children change
 * size, such as a card opening. `key` changes whenever the children are replaced.
 */
export function useScrollFades(ref: RefObject<HTMLElement>, block: string, key: unknown): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      el.classList.toggle(`${block}--more-above`, el.scrollTop > 1);
      el.classList.toggle(
        `${block}--more-below`,
        el.scrollTop + el.clientHeight < el.scrollHeight - 1,
      );
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const resizes = new ResizeObserver(update);
    resizes.observe(el);
    for (const child of el.children) resizes.observe(child);
    return () => {
      el.removeEventListener("scroll", update);
      resizes.disconnect();
    };
  }, [ref.current, key]);
}
