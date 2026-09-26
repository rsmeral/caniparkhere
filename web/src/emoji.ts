/**
 * The Twemoji image for an emoji (see web/public/emoji/). Emoji are shown as images rather
 * than text because the phone's own emoji look blurry at this size. Twemoji names each file
 * by the emoji's code points in hex, joined by "-", and leaves out the U+FE0F variation
 * selector unless the emoji is a zero-width-joiner sequence.
 *
 * @example emojiUrl("🧭") -> "/emoji/1f9ed.svg"
 */
export function emojiUrl(emoji: string): string {
  const codePoints = [...emoji].map((char) => char.codePointAt(0)!);
  const kept = codePoints.includes(0x200d) ? codePoints : codePoints.filter((cp) => cp !== 0xfe0f);
  return `/emoji/${kept.map((cp) => cp.toString(16)).join("-")}.svg`;
}
