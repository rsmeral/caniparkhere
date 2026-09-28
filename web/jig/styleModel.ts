import type { Tone } from "../src/describe";

// Colours are tuned in OKLCH: lightness, chroma (how colourful) and hue. Unlike HSL, equal
// lightness and chroma there look equally light and equally colourful across hues, so giving
// every tone the same L and C is what makes them feel like one family.

export interface Lch {
  l: number;
  c: number;
  h: number;
}

export type TextChoice = "auto" | "light" | "dark";

export interface ToneSpec extends Lch {
  /** On the page background. */
  text: TextChoice;
  /** On a candidate card's panel, which is the plain tone. */
  panelText: TextChoice;
}

/**
 * Fonts to try for the sentence, each with the Google Fonts axes it has, as the css2 API
 * wants them. An empty `axes` asks for the regular style only.
 */
export const FONTS: { family: string; axes: string }[] = [
  { family: "", axes: "" },
  {
    family: "Fraunces",
    axes: "ital,opsz,wght,SOFT,WONK@0,9..144,100..900,0..100,0..1;1,9..144,100..900,0..100,0..1",
  },
  { family: "Instrument Serif", axes: "ital@0;1" },
  { family: "Newsreader", axes: "ital,opsz,wght@0,6..72,200..800;1,6..72,200..800" },
  { family: "Literata", axes: "ital,opsz,wght@0,7..72,200..900;1,7..72,200..900" },
  { family: "Lora", axes: "ital,wght@0,400..700;1,400..700" },
  { family: "Young Serif", axes: "" },
  { family: "DM Serif Display", axes: "ital@0;1" },
  { family: "Playfair Display", axes: "ital,wght@0,400..900;1,400..900" },
  { family: "Recursive", axes: "slnt,wght,CASL,CRSV,MONO@-15..0,300..1000,0..1,0..1,0..1" },
  {
    family: "Shantell Sans",
    axes: "ital,wght,BNCE,INFM,SPAC@0,300..800,-100..100,0..100,0..100;1,300..800,-100..100,0..100,0..100",
  },
  { family: "Caveat", axes: "wght@400..700" },
  { family: "Kalam", axes: "wght@300;400;700" },
  { family: "Patrick Hand", axes: "" },
];

export const TONES: Tone[] = ["good", "warn", "caution", "danger", "outside", "neutral"];

export interface StyleState {
  enabled: boolean;
  tones: Record<Tone, ToneSpec>;
  /** Applied on top of every tone. `pull` moves each hue towards `anchorHue`, 0 to 1. */
  global: { dl: number; cScale: number; hueRotate: number; anchorHue: number; pull: number };
  background: {
    mode: "solid" | "radial" | "linear";
    x: number;
    y: number;
    size: number;
    angle: number;
    /** The edge colour, relative to the tone. */
    dl: number;
    dc: number;
    dh: number;
    panels: boolean;
  };
  halo: {
    size: number;
    color: "black" | "white" | "tone" | "custom";
    custom: string;
    opacity: number;
    extent: number;
    falloff: number;
    blend: string;
    shadowBlur: number;
    shadowY: number;
    shadowOpacity: number;
  };
  /** Sizes and spacing in rem. The halo is painted around the emoji and takes no space. */
  layout: { emojiSize: number; sentenceGap: number; cardsGap: number; cardMinWidth: number };
  sentence: {
    /** One of FONTS, or "" for the app's own. */
    font: string;
    /** Any other Google Fonts family, loaded in its regular style; wins over `font`. */
    customFamily: string;
    size: number;
    weight: number;
    italic: boolean;
    letterSpacing: number;
    lineHeight: number;
    /** A font-variation-settings value, e.g. "SOFT" 100, "WONK" 1. */
    variation: string;
    rotate: number;
    skewX: number;
    skewY: number;
    rotateX: number;
    rotateY: number;
    perspective: number;
    align: "center" | "left";
    /** CSS text-wrap: "balance" evens out the lines, "pretty" avoids a lone last word. */
    wrap: "auto" | "balance" | "pretty";
    maxWidth: number;
  };
  texture: {
    kind: "none" | "noise" | "image";
    noiseType: "fractalNoise" | "turbulence";
    frequency: number;
    octaves: number;
    tile: number;
    /** For `image`: any URL, e.g. a file dropped into public/. */
    url: string;
    opacity: number;
    blend: string;
  };
  surfaces: {
    card: string;
    cardAlpha: number;
    cardTinted: boolean;
    /**
     * Two shadow layers under each card, the usual way to fake depth: a tight "key" shadow
     * right under it and a wide, faint "ambient" one around it. Plus a thin light line along
     * the top edge, as if lit from above. Opacity 0 turns a layer off.
     */
    shadowColor: "black" | "tone";
    keyY: number;
    keyBlur: number;
    keyOpacity: number;
    ambientY: number;
    ambientBlur: number;
    ambientOpacity: number;
    highlight: number;
    pay: string;
    cleaningSoon: string;
    cleaningToday: string;
    darkText: string;
  };
  /** The app icon in the corner and the About page it opens. Tints are % of the text colour. */
  about: {
    iconSize: number;
    iconRadius: number;
    iconShadowBlur: number;
    iconShadowY: number;
    iconShadowOpacity: number;
    background: string;
    text: string;
    titleSize: number;
    bodySize: number;
    actionSize: number;
    actionTint: number;
    closeSize: number;
    closeGlyph: number;
    closeThickness: number;
  };
  customCss: string;
  /** A full replacement for app.css, or null to keep the file's own. */
  appCss: string | null;
}

// ---- colour maths ---------------------------------------------------------------------

type Rgb = [number, number, number];

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function lchToLinearRgb({ l, c, h }: Lch): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** The colour as sRGB, with chroma reduced until it fits, which keeps its hue and lightness. */
export function toSrgb(lch: Lch): { rgb: Rgb; clipped: boolean } {
  const l = Math.min(Math.max(lch.l, 0), 1);
  let c = Math.max(lch.c, 0);
  let clipped = false;
  if (!inGamut(lchToLinearRgb({ l, c, h: lch.h }))) {
    clipped = true;
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(lchToLinearRgb({ l, c: mid, h: lch.h }))) lo = mid;
      else hi = mid;
    }
    c = lo;
  }
  const linear = lchToLinearRgb({ l, c, h: lch.h });
  return {
    rgb: linear.map((v) => Math.min(Math.max(fromLinear(v), 0), 1)) as Rgb,
    clipped,
  };
}

export function toHex(lch: Lch): string {
  const { rgb } = toSrgb(lch);
  return `#${rgb
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as Rgb;
}

export function hexToLch(hex: string): Lch {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B);
  const h = c < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: round(L, 3), c: round(c, 3), h: round(h, 1) };
}

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio between two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---- the tuned palette ----------------------------------------------------------------

/** The signed shortest turn from hue `from` to hue `to`, -180 to 180. */
const hueDelta = (from: number, to: number) => ((to - from + 540) % 360) - 180;

/** A tone after the global adjustments. */
export function effectiveTone(state: StyleState, tone: Tone): Lch {
  const t = state.tones[tone];
  const { dl, cScale, hueRotate, anchorHue, pull } = state.global;
  const rotated = t.h + hueRotate;
  const h = (rotated + pull * hueDelta(rotated, anchorHue) + 360) % 360;
  return { l: t.l + dl, c: t.c * cScale, h };
}

export interface ResolvedTone {
  base: string;
  edge: string;
  text: string;
  panelText: string;
  clipped: boolean;
  lch: Lch;
}

/** White or the dark text colour, as chosen, or whichever reads better on `background`. */
function textOn(background: string, choice: TextChoice, dark: string): string {
  if (choice === "light") return "#ffffff";
  if (choice === "dark") return dark;
  return contrast(background, "#ffffff") >= contrast(background, dark) ? "#ffffff" : dark;
}

export function resolveTone(state: StyleState, tone: Tone): ResolvedTone {
  const lch = effectiveTone(state, tone);
  const { clipped } = toSrgb(lch);
  const base = toHex(lch);
  const { dl, dc, dh } = state.background;
  const edge = toHex({ l: lch.l + dl, c: Math.max(lch.c + dc, 0), h: lch.h + dh });
  const { text, panelText } = state.tones[tone];
  const dark = state.surfaces.darkText;
  return {
    base,
    edge,
    text: textOn(base, text, dark),
    panelText: textOn(base, panelText, dark),
    clipped,
    lch,
  };
}

// ---- presets --------------------------------------------------------------------------

// The tones in app.css.
const APP_HEX: Record<Tone, string> = {
  good: "#35ba5f",
  warn: "#eda126",
  caution: "#f36e2e",
  danger: "#de4845",
  outside: "#3d7ce3",
  neutral: "#656b77",
};

// The lighter tones, whose candidate panels carry dark text in app.css.
const DARK_PANEL_TEXT = new Set<Tone>(["good", "warn", "caution"]);

const toneFromHex = (tone: Tone): ToneSpec => ({
  ...hexToLch(APP_HEX[tone]),
  text: "light",
  panelText: DARK_PANEL_TEXT.has(tone) ? "dark" : "light",
});

/** Every tone at one lightness and chroma, keeping the app's hues. */
function uniform(l: number, c: number): Record<Tone, ToneSpec> {
  return Object.fromEntries(
    TONES.map((tone) => {
      const own = toneFromHex(tone);
      const c2 = tone === "neutral" ? Math.min(c, 0.02) : c;
      return [tone, { ...own, l, c: c2, text: "auto", panelText: "auto" }];
    }),
  ) as Record<Tone, ToneSpec>;
}

export const DEFAULT_STATE: StyleState = {
  enabled: true,
  tones: Object.fromEntries(TONES.map((t) => [t, toneFromHex(t)])) as Record<Tone, ToneSpec>,
  global: { dl: 0, cScale: 1, hueRotate: 0, anchorHue: 60, pull: 0 },
  background: {
    mode: "radial",
    x: 50,
    y: 30,
    size: 92,
    angle: 180,
    dl: -0.235,
    dc: -0.04,
    dh: 0,
    panels: false,
  },
  halo: {
    size: 12,
    color: "black",
    custom: "#000000",
    opacity: 0.44,
    extent: 80,
    falloff: 2.2,
    blend: "normal",
    shadowBlur: 2,
    shadowY: 3,
    shadowOpacity: 0.29,
  },
  layout: { emojiSize: 7, sentenceGap: 2.5, cardsGap: 3, cardMinWidth: 15 },
  sentence: {
    font: "Fraunces",
    customFamily: "",
    size: 1.4,
    weight: 650,
    italic: false,
    letterSpacing: 0,
    lineHeight: 1.35,
    variation: "",
    rotate: 4.1,
    skewX: 0,
    skewY: -6,
    rotateX: 0,
    rotateY: 0,
    perspective: 600,
    align: "center",
    wrap: "balance",
    maxWidth: 28,
  },
  texture: {
    kind: "noise",
    noiseType: "turbulence",
    frequency: 0.75,
    octaves: 3,
    tile: 192,
    url: "",
    opacity: 0.25,
    blend: "multiply",
  },
  surfaces: {
    card: "#000000",
    cardAlpha: 0.3,
    cardTinted: false,
    shadowColor: "black",
    keyY: 2,
    keyBlur: 2.5,
    keyOpacity: 0.2,
    ambientY: 8,
    ambientBlur: 24,
    ambientOpacity: 0,
    highlight: 0.15,
    pay: "#15803d",
    cleaningSoon: "#fcd34d",
    cleaningToday: "#ff6868",
    darkText: "#1f2937",
  },
  about: {
    iconSize: 1.75,
    iconRadius: 0.45,
    iconShadowBlur: 3,
    iconShadowY: 1,
    iconShadowOpacity: 0.55,
    background: "#ffffff",
    text: "#111111",
    titleSize: 1.9,
    bodySize: 1.15,
    actionSize: 0.8,
    actionTint: 6,
    closeSize: 3.5,
    closeGlyph: 1.6,
    closeThickness: 3.2,
  },
  customCss: "",
  appCss: null,
};

export const PRESETS: { name: string; apply(state: StyleState): StyleState }[] = [
  { name: "The app today", apply: () => structuredClone(DEFAULT_STATE) },
  { name: "Even: L 0.72, C 0.13", apply: (s) => ({ ...s, tones: uniform(0.72, 0.13) }) },
  { name: "Soft: L 0.78, C 0.09", apply: (s) => ({ ...s, tones: uniform(0.78, 0.09) }) },
  { name: "Pastel: L 0.86, C 0.06", apply: (s) => ({ ...s, tones: uniform(0.86, 0.06) }) },
  { name: "Deep: L 0.58, C 0.12", apply: (s) => ({ ...s, tones: uniform(0.58, 0.12) }) },
];

// ---- CSS ------------------------------------------------------------------------------

const pct = (v: number) => `${round(v * 100, 1)}%`;

function backgroundOf(state: StyleState, tone: Tone): string {
  const { mode, x, y, size, angle } = state.background;
  const base = `var(--tone-${tone})`;
  const edge = `var(--tone-${tone}-edge)`;
  if (mode === "radial") {
    return `radial-gradient(circle farthest-corner at ${x}% ${y}% in oklab, ${base} 0%, ${edge} ${size}%)`;
  }
  if (mode === "linear")
    return `linear-gradient(${angle}deg in oklab, ${base} 0%, ${edge} ${size}%)`;
  return base;
}

/** Stops for a halo whose opacity eases from `opacity` at the centre to 0 at `extent`. */
function haloStops(state: StyleState): string {
  const { opacity, extent, falloff } = state.halo;
  const steps = 8;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const alpha = opacity * (1 - t) ** falloff;
    return `color-mix(in srgb, var(--halo-color) ${pct(alpha)}, transparent) ${round(t * extent, 1)}%`;
  }).join(",\n    ");
}

function haloColor(state: StyleState, tone: Tone): string {
  const { color, custom } = state.halo;
  if (color === "white") return "#ffffff";
  if (color === "custom") return custom;
  if (color === "tone") {
    const t = effectiveTone(state, tone);
    return toHex({ l: t.l * 0.35, c: t.c * 0.8, h: t.h });
  }
  return "#000000";
}

/** The card's box-shadow declaration, or nothing when every layer is off. */
function cardShadow(state: StyleState, tone: Tone): string {
  const s = state.surfaces;
  const t = effectiveTone(state, tone);
  const colour =
    s.shadowColor === "tone" ? toHex({ l: t.l * 0.3, c: t.c * 0.9, h: t.h }) : "#000000";
  const mix = (opacity: number) => `color-mix(in srgb, ${colour} ${pct(opacity)}, transparent)`;
  const layers = [
    s.highlight > 0 && `inset 0 1px 0 rgba(255, 255, 255, ${s.highlight})`,
    s.keyOpacity > 0 && `0 ${s.keyY}px ${s.keyBlur}px ${mix(s.keyOpacity)}`,
    s.ambientOpacity > 0 && `0 ${s.ambientY}px ${s.ambientBlur}px ${mix(s.ambientOpacity)}`,
  ].filter(Boolean);
  return layers.length ? `\n  box-shadow: ${layers.join(", ")};` : "";
}

function cardColor(state: StyleState, tone: Tone): string {
  const { card, cardAlpha, cardTinted } = state.surfaces;
  const alpha = Math.round(cardAlpha * 255)
    .toString(16)
    .padStart(2, "0");
  if (!cardTinted) return `${card}${alpha}`;
  const t = effectiveTone(state, tone);
  return `${toHex({ l: 0.25, c: t.c * 0.5, h: t.h })}${alpha}`;
}

/** The Google Fonts stylesheet for the sentence's font, or null for the app's own. */
function fontUrlOf(state: StyleState): string | null {
  const { font, customFamily } = state.sentence;
  const family = customFamily.trim() || font;
  if (!family) return null;
  const axes = customFamily.trim() ? "" : (FONTS.find((f) => f.family === font)?.axes ?? "");
  const name = family.replace(/ /g, "+");
  return `https://fonts.googleapis.com/css2?family=${name}${axes ? `:${axes}` : ""}&display=swap`;
}

/** The sentence's type and tilt, as declarations. Values left at the app's own are omitted. */
function sentenceCss(state: StyleState): string {
  const s = state.sentence;
  const family = s.customFamily.trim() || s.font;
  const lines = [
    family && `font-family: "${family}", system-ui, serif;`,
    `font-size: ${s.size}rem;`,
    `font-weight: ${s.weight};`,
    s.italic && "font-style: italic;",
    s.letterSpacing !== 0 && `letter-spacing: ${s.letterSpacing}em;`,
    s.align !== "center" && `text-align: ${s.align};`,
    s.align !== "center" && "align-self: stretch;",
    s.wrap !== "auto" && `text-wrap: ${s.wrap};`,
    `max-width: ${s.maxWidth}rem;`,
    `line-height: ${s.lineHeight};`,
    s.variation.trim() && `font-variation-settings: ${s.variation.trim()};`,
  ];
  const tilted = [s.rotate, s.skewX, s.skewY, s.rotateX, s.rotateY].some((v) => v !== 0);
  if (tilted) {
    lines.push(
      `transform: perspective(${s.perspective}px) rotateX(${s.rotateX}deg) rotateY(${s.rotateY}deg) rotate(${s.rotate}deg) skew(${s.skewX}deg, ${s.skewY}deg);`,
    );
  }
  return lines
    .filter(Boolean)
    .map((l) => `  ${l}\n`)
    .join("");
}

/** A tile of grey noise, as an SVG data URL. */
function noiseUrl(state: StyleState): string {
  const { noiseType, frequency, octaves, tile } = state.texture;
  const grey = "0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0 0 0 0 1";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}"><filter id="n"><feTurbulence type="${noiseType}" baseFrequency="${frequency}" numOctaves="${octaves}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="${grey}"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * A texture over the whole page background, under the content. The page becomes its own
 * stacking context so the texture's negative z-index keeps it above the page's background.
 */
function textureCss(state: StyleState): string {
  const t = state.texture;
  if (t.kind === "none" || (t.kind === "image" && !t.url.trim())) return "";
  const url = t.kind === "noise" ? noiseUrl(state) : t.url.trim();
  return `
.app {
  isolation: isolate;
}

.app::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  background: url("${url}") 0 0 / ${t.tile}px ${t.tile}px repeat;
  opacity: ${t.opacity};
  mix-blend-mode: ${t.blend};
  pointer-events: none;
}
`;
}

function aboutCss(state: StyleState): string {
  const a = state.about;
  const tint = (percent: number) => `color-mix(in srgb, currentColor ${percent}%, transparent)`;
  return `
.app__about-button {
  filter: drop-shadow(0 ${a.iconShadowY}px ${a.iconShadowBlur}px rgba(0, 0, 0, ${a.iconShadowOpacity}));
}

.app__about-icon {
  width: ${a.iconSize}rem;
  height: ${a.iconSize}rem;
  border-radius: ${a.iconRadius}rem;
}

.app__sheet,
.app__sheet::backdrop {
  background: ${a.background};
}

.app__sheet {
  color: ${a.text};
}

.app__sheet-body {
  font-size: ${a.bodySize}rem;
}

.app__sheet-title {
  font-size: ${a.titleSize}rem;
}

.app__sheet-action {
  font-size: ${a.actionSize}rem;
  background: ${tint(a.actionTint)};
}

.app__sheet-action:hover,
.app__sheet-action:focus-visible {
  background: ${tint(a.actionTint * 2)};
}

.app__sheet-close {
  width: ${a.closeSize}rem;
  height: ${a.closeSize}rem;
}

.app__sheet-close svg {
  width: ${a.closeGlyph}rem;
  height: ${a.closeGlyph}rem;
}

.app__sheet-close path {
  stroke-width: ${a.closeThickness};
}
`;
}

/** The overrides for the tuned style, laid over app.css. */
export function generateCss(state: StyleState): string {
  const { halo, layout, surfaces, background } = state;
  const root = TONES.flatMap((tone) => {
    const r = resolveTone(state, tone);
    return [
      `  --tone-${tone}: ${r.base};`,
      `  --tone-${tone}-edge: ${r.edge};`,
      `  --tone-${tone}-text: ${r.text};`,
      `  --tone-${tone}-panel-text: ${r.panelText};`,
    ];
  });
  const tones = TONES.map((tone) => {
    const panels =
      tone === "outside"
        ? ""
        : `\n.app__resolve--${tone} {\n  background: ${background.panels ? backgroundOf(state, tone) : `var(--tone-${tone})`};\n  color: var(--tone-${tone}-panel-text);\n}\n.app__resolve--${tone} .app__detail-expanded {\n  border-top-color: color-mix(in srgb, var(--tone-${tone}-panel-text) 30%, transparent);\n}`;
    return `.app--${tone} {
  background: ${backgroundOf(state, tone)};
  color: var(--tone-${tone}-text);
  --halo-color: ${haloColor(state, tone)};
}
.app--${tone} .app__detail {
  background: ${cardColor(state, tone)};${cardShadow(state, tone)}
}${panels}`;
  }).join("\n");

  const fontUrl = fontUrlOf(state);
  return `${fontUrl ? `@import url("${fontUrl}");\n\n` : ""}:root {
${root.join("\n")}
}

${tones}

.app {
  gap: 0;
}

.app__sentence {
  margin-top: ${layout.sentenceGap}rem;
${sentenceCss(state)}}

.app__cards {
  margin-top: ${layout.cardsGap}rem;
}
${
  layout.cardMinWidth > 0
    ? `
.app__detail {
  min-width: min(${layout.cardMinWidth}rem, 100vw - 4rem);
}
`
    : ""
}${textureCss(state)}
.app__emoji-halo {
  position: relative;
  width: auto;
  height: auto;
  background: none;
}

.app__emoji-halo::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  translate: -50% -50%;
  width: min(44vw, ${halo.size}rem);
  height: min(44vw, ${halo.size}rem);
  border-radius: 50%;
  mix-blend-mode: ${halo.blend};
  background: radial-gradient(
    circle,
    ${haloStops(state)}
  );
  pointer-events: none;
}

.app__emoji {
  position: relative;
  width: min(30vw, ${layout.emojiSize}rem);
  height: min(30vw, ${layout.emojiSize}rem);
  filter: drop-shadow(0 ${halo.shadowY}px ${halo.shadowBlur}px rgba(0, 0, 0, ${halo.shadowOpacity}));
}

.app__pay {
  background: ${surfaces.pay};
}

.app__detail-cleaning {
  color: ${surfaces.cleaningSoon};
}

.app__detail-cleaning--today {
  color: ${surfaces.cleaningToday};
}
${aboutCss(state)}${state.customCss ? `\n/* Custom */\n${state.customCss}\n` : ""}`;
}

// ---- persistence ----------------------------------------------------------------------

const STORAGE_KEY = "caniparkhere.styleJig";

export function loadState(): StyleState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return mergeDeep(structuredClone(DEFAULT_STATE), JSON.parse(saved));
  } catch {
    // A missing or unreadable save starts from the app's own style.
  }
  return structuredClone(DEFAULT_STATE);
}

export function saveState(state: StyleState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Not saved; the page still works.
  }
}

/** A saved state over the defaults, so settings added later start at their default. */
function mergeDeep<T>(base: T, saved: unknown): T {
  if (typeof base !== "object" || base === null || typeof saved !== "object" || saved === null) {
    return (saved ?? base) as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(saved)) {
    out[key] = key in out ? mergeDeep(out[key], value) : value;
  }
  return out as T;
}
