import { render, type ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import appCssSource from "../src/app.css?raw";
import type { Tone } from "../src/describe";
import type { GeoState } from "../src/useGeolocation";
import type { FrameMessage, JigMessage } from "./protocol";
import {
  contrast,
  DEFAULT_STATE,
  effectiveTone,
  FONTS,
  generateCss,
  loadState,
  PRESETS,
  resolveTone,
  saveState,
  type StyleState,
  toHex,
  TONES,
} from "./styleModel";
import "./style.css";

// Each app state is a real location and moment, answered by the app's own lookup, so the
// phones show exactly what the app would.
const ready = (lat: number, lon: number, accuracyMeters: number): GeoState => ({
  status: "ready",
  lat,
  lon,
  accuracyMeters,
});

const STATES: {
  id: string;
  label: string;
  geo: GeoState;
  at: string | null;
  /** Opens the About page once the app is showing. */
  about?: boolean;
}[] = [
  { id: "free", label: "Free now", geo: ready(50.0755, 14.4378, 8), at: "2026-09-30T23:00" },
  { id: "paid", label: "Paid", geo: ready(50.0755, 14.4378, 8), at: "2026-09-30T19:13" },
  {
    id: "soon",
    label: "Free, not for long",
    geo: ready(50.0755, 14.4378, 8),
    at: "2026-09-30T07:30",
  },
  {
    id: "resident",
    label: "Resident-only",
    geo: ready(50.07537, 14.43061, 5),
    at: "2026-09-30T12:00",
  },
  {
    id: "candidates",
    label: "Candidates",
    geo: ready(50.07759, 14.41712, 30),
    at: "2026-09-30T19:13",
  },
  {
    id: "cleaning",
    label: "Cleaning today",
    geo: ready(50.07759, 14.41712, 5),
    at: "2026-10-03T10:00",
  },
  {
    id: "cleaningMaybe",
    label: "Cleaning, candidates",
    geo: ready(50.07759, 14.41712, 30),
    at: "2026-10-03T10:00",
  },
  { id: "noInfo", label: "No info", geo: ready(50.06391, 14.43451, 10), at: "2026-09-30T19:13" },
  { id: "searching", label: "Searching", geo: { status: "searching" }, at: null },
  {
    id: "outside",
    label: "Outside Prague",
    geo: ready(49.1951, 16.6068, 10),
    at: "2026-09-30T19:13",
  },
  {
    id: "about",
    label: "About page",
    geo: ready(50.0755, 14.4378, 8),
    at: "2026-09-30T19:13",
    about: true,
  },
];

const DEVICES = [
  { label: "390 × 844", width: 390, height: 844 },
  { label: "360 × 800", width: 360, height: 800 },
  { label: "375 × 667", width: 375, height: 667 },
];

const BLENDS = [
  "normal",
  "multiply",
  "soft-light",
  "overlay",
  "screen",
  "hard-light",
  "darken",
  "lighten",
  "color-burn",
  "luminosity",
];

function StyleJig() {
  const [state, setState] = useState<StyleState>(loadState);
  const [scale, setScale] = useState(0.5);
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [shown, setShown] = useState<string[]>(STATES.map((s) => s.id));
  const [reloadKey, setReloadKey] = useState(0);
  const frames = useRef(new Map<string, HTMLIFrameElement>());

  useEffect(() => saveState(state), [state]);

  const css = useMemo(() => generateCss(state), [state]);
  const latest = useRef({ css, state });
  latest.current = { css, state };

  const update = (change: (s: StyleState) => StyleState) =>
    setState((s) => change(structuredClone(s)));

  // Frames are same-origin, so the style goes straight into each one's document.
  const applyTo = (frame: HTMLIFrameElement) => {
    const doc = frame.contentDocument;
    if (!doc?.head) return;
    const { css, state } = latest.current;
    let tweak = doc.getElementById("style-jig") as HTMLStyleElement | null;
    if (!tweak) {
      tweak = doc.createElement("style");
      tweak.id = "style-jig";
      doc.head.append(tweak);
    }
    // The app fades between tones, which would lag behind every slider move here. It goes
    // last because the generated CSS may start with a font @import, which must come first.
    tweak.textContent = `${state.enabled ? css : ""}\n.app { transition: none; }`;
    // Vite serves app.css in dev as a style element of its own, which an edited copy replaces.
    const app = doc.querySelector<HTMLStyleElement>('style[data-vite-dev-id$="/src/app.css"]');
    if (app) {
      app.dataset.original ??= app.textContent ?? "";
      app.textContent =
        state.enabled && state.appCss !== null ? state.appCss : app.dataset.original;
    }
    doc.head.append(tweak);
  };

  useEffect(() => {
    for (const frame of frames.current.values()) applyTo(frame);
  }, [css, state.enabled, state.appCss]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<FrameMessage>) => {
      if (event.data?.type !== "ready") return;
      for (const [id, frame] of frames.current) {
        if (!frame.contentWindow || frame.contentWindow !== event.source) continue;
        const spec = STATES.find((s) => s.id === id)!;
        const message: JigMessage = {
          type: "show",
          geo: spec.geo,
          at: spec.at === null ? null : new Date(spec.at).getTime(),
          cleaningEverywhereToday: false,
        };
        frame.contentWindow.postMessage(message, location.origin);
        applyTo(frame);
        if (spec.about) {
          setTimeout(
            () =>
              frame.contentDocument
                ?.querySelector<HTMLButtonElement>(".app__about-button")
                ?.click(),
            300,
          );
        }
      }
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, []);

  const device = DEVICES[deviceIndex];

  return (
    <div className="sj">
      <aside className="sj__panel">
        <div className="sj__bar">
          <label className="sj__toggle">
            <input
              type="checkbox"
              checked={state.enabled}
              onChange={(e) => update((s) => ({ ...s, enabled: e.currentTarget.checked }))}
            />
            Tweaks on
          </label>
          <select
            value=""
            onChange={(e) => {
              const preset = PRESETS[Number(e.currentTarget.value)];
              if (preset) update(preset.apply);
            }}
          >
            <option value="">Preset…</option>
            {PRESETS.map((p, i) => (
              <option key={p.name} value={i}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => navigator.clipboard.writeText(css)}>
            Copy CSS
          </button>
          <button
            type="button"
            onClick={() =>
              confirm("Reset everything to the app's current style?") &&
              setState(structuredClone(DEFAULT_STATE))
            }
          >
            Reset
          </button>
        </div>

        <Section title="Palette" open>
          <Wheel state={state} update={update} />
          <Slider
            label="Lightness shift"
            min={-0.3}
            max={0.3}
            step={0.005}
            value={state.global.dl}
            onInput={(v) => update((s) => ((s.global.dl = v), s))}
          />
          <Slider
            label="Chroma scale"
            min={0}
            max={2}
            step={0.01}
            value={state.global.cScale}
            onInput={(v) => update((s) => ((s.global.cScale = v), s))}
          />
          <Slider
            label="Hue rotate"
            min={-180}
            max={180}
            step={1}
            value={state.global.hueRotate}
            unit="°"
            onInput={(v) => update((s) => ((s.global.hueRotate = v), s))}
          />
          <Slider
            label="Pull hues toward"
            min={0}
            max={360}
            step={1}
            value={state.global.anchorHue}
            unit="°"
            track={hueTrack(0.75, 0.12)}
            onInput={(v) => update((s) => ((s.global.anchorHue = v), s))}
          />
          <Slider
            label="Pull amount"
            min={0}
            max={1}
            step={0.01}
            value={state.global.pull}
            onInput={(v) => update((s) => ((s.global.pull = v), s))}
          />
          <div className="sj__row">
            <button type="button" onClick={() => update(evenOut("l"))}>
              Even out lightness
            </button>
            <button type="button" onClick={() => update(evenOut("c"))}>
              Even out chroma
            </button>
          </div>
          {TONES.map((tone) => (
            <ToneRow key={tone} tone={tone} state={state} update={update} />
          ))}
        </Section>

        <Section title="Background" open>
          <Choice
            value={state.background.mode}
            options={["solid", "radial", "linear"]}
            onChange={(v) =>
              update((s) => ((s.background.mode = v as StyleState["background"]["mode"]), s))
            }
          />
          {state.background.mode !== "solid" && (
            <>
              {state.background.mode === "radial" ? (
                <>
                  <Slider
                    label="Centre x"
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
                    value={state.background.x}
                    onInput={(v) => update((s) => ((s.background.x = v), s))}
                  />
                  <Slider
                    label="Centre y"
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
                    value={state.background.y}
                    onInput={(v) => update((s) => ((s.background.y = v), s))}
                  />
                </>
              ) : (
                <Slider
                  label="Angle"
                  min={0}
                  max={360}
                  step={1}
                  unit="°"
                  value={state.background.angle}
                  onInput={(v) => update((s) => ((s.background.angle = v), s))}
                />
              )}
              <Slider
                label="Reaches edge at"
                min={20}
                max={200}
                step={1}
                unit="%"
                value={state.background.size}
                onInput={(v) => update((s) => ((s.background.size = v), s))}
              />
              <Slider
                label="Edge lightness"
                min={-0.4}
                max={0.4}
                step={0.005}
                value={state.background.dl}
                onInput={(v) => update((s) => ((s.background.dl = v), s))}
              />
              <Slider
                label="Edge chroma"
                min={-0.2}
                max={0.2}
                step={0.005}
                value={state.background.dc}
                onInput={(v) => update((s) => ((s.background.dc = v), s))}
              />
              <Slider
                label="Edge hue shift"
                min={-90}
                max={90}
                step={1}
                unit="°"
                value={state.background.dh}
                onInput={(v) => update((s) => ((s.background.dh = v), s))}
              />
              <Check
                label="Also on candidate panels"
                checked={state.background.panels}
                onChange={(v) => update((s) => ((s.background.panels = v), s))}
              />
            </>
          )}
        </Section>

        <Section title="Emoji halo" open>
          <Choice
            value={state.halo.color}
            options={["black", "white", "tone", "custom"]}
            onChange={(v) => update((s) => ((s.halo.color = v as StyleState["halo"]["color"]), s))}
          />
          {state.halo.color === "custom" && (
            <Color
              label="Halo colour"
              value={state.halo.custom}
              onInput={(v) => update((s) => ((s.halo.custom = v), s))}
            />
          )}
          <Slider
            label="Size"
            min={4}
            max={20}
            step={0.25}
            unit="rem"
            value={state.halo.size}
            onInput={(v) => update((s) => ((s.halo.size = v), s))}
          />
          <Slider
            label="Centre opacity"
            min={0}
            max={1}
            step={0.01}
            value={state.halo.opacity}
            onInput={(v) => update((s) => ((s.halo.opacity = v), s))}
          />
          <Slider
            label="Fades out at"
            min={10}
            max={100}
            step={1}
            unit="%"
            value={state.halo.extent}
            onInput={(v) => update((s) => ((s.halo.extent = v), s))}
          />
          <Slider
            label="Falloff (1 linear, higher tighter)"
            min={0.3}
            max={5}
            step={0.05}
            value={state.halo.falloff}
            onInput={(v) => update((s) => ((s.halo.falloff = v), s))}
          />
          <label className="sj__field">
            <span>Blend</span>
            <select
              value={state.halo.blend}
              onChange={(e) => update((s) => ((s.halo.blend = e.currentTarget.value), s))}
            >
              {BLENDS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <Slider
            label="Emoji shadow blur"
            min={0}
            max={20}
            step={0.5}
            unit="px"
            value={state.halo.shadowBlur}
            onInput={(v) => update((s) => ((s.halo.shadowBlur = v), s))}
          />
          <Slider
            label="Emoji shadow offset"
            min={0}
            max={10}
            step={0.5}
            unit="px"
            value={state.halo.shadowY}
            onInput={(v) => update((s) => ((s.halo.shadowY = v), s))}
          />
          <Slider
            label="Emoji shadow opacity"
            min={0}
            max={1}
            step={0.01}
            value={state.halo.shadowOpacity}
            onInput={(v) => update((s) => ((s.halo.shadowOpacity = v), s))}
          />
        </Section>

        <Section title="Sizes and spacing" open>
          <Slider
            label="Emoji"
            min={3}
            max={12}
            step={0.25}
            unit="rem"
            value={state.layout.emojiSize}
            onInput={(v) => update((s) => ((s.layout.emojiSize = v), s))}
          />
          <Slider
            label="Emoji to sentence"
            min={0}
            max={5}
            step={0.125}
            unit="rem"
            value={state.layout.sentenceGap}
            onInput={(v) => update((s) => ((s.layout.sentenceGap = v), s))}
          />
          <Slider
            label="Sentence to cards"
            min={0}
            max={5}
            step={0.125}
            unit="rem"
            value={state.layout.cardsGap}
            onInput={(v) => update((s) => ((s.layout.cardsGap = v), s))}
          />
          <Slider
            label="Card min width (0 off)"
            min={0}
            max={24}
            step={0.25}
            unit="rem"
            value={state.layout.cardMinWidth}
            onInput={(v) => update((s) => ((s.layout.cardMinWidth = v), s))}
          />
        </Section>

        <Section title="Sentence" open>
          <label className="sj__field">
            <span>Font</span>
            <select
              value={state.sentence.font}
              onChange={(e) => update((s) => ((s.sentence.font = e.currentTarget.value), s))}
            >
              {FONTS.map((f) => (
                <option key={f.family} value={f.family}>
                  {f.family || "The app's own (system-ui)"}
                </option>
              ))}
            </select>
          </label>
          <label className="sj__field">
            <span>Other Google font</span>
            <input
              className="sj__text"
              placeholder="e.g. Crimson Pro"
              value={state.sentence.customFamily}
              onChange={(e) =>
                update((s) => ((s.sentence.customFamily = e.currentTarget.value), s))
              }
            />
          </label>
          <Slider
            label="Size"
            min={0.8}
            max={2.5}
            step={0.05}
            unit="rem"
            value={state.sentence.size}
            onInput={(v) => update((s) => ((s.sentence.size = v), s))}
          />
          <Slider
            label="Weight"
            min={100}
            max={900}
            step={10}
            value={state.sentence.weight}
            onInput={(v) => update((s) => ((s.sentence.weight = v), s))}
          />
          <Check
            label="Italic"
            checked={state.sentence.italic}
            onChange={(v) => update((s) => ((s.sentence.italic = v), s))}
          />
          <Slider
            label="Letter spacing"
            min={-0.08}
            max={0.15}
            step={0.005}
            unit="em"
            value={state.sentence.letterSpacing}
            onInput={(v) => update((s) => ((s.sentence.letterSpacing = v), s))}
          />
          <Choice
            value={state.sentence.align}
            options={["center", "left"]}
            onChange={(v) =>
              update((s) => ((s.sentence.align = v as StyleState["sentence"]["align"]), s))
            }
          />
          <Choice
            value={state.sentence.wrap}
            options={["auto", "balance", "pretty"]}
            onChange={(v) =>
              update((s) => ((s.sentence.wrap = v as StyleState["sentence"]["wrap"]), s))
            }
          />
          <p className="sj__hint">
            balance evens out the line lengths; pretty only keeps a word from sitting alone on the
            last line.{" "}
            {CSS.supports("text-wrap", "pretty")
              ? "This browser supports both."
              : "This browser ignores pretty."}
          </p>
          <Slider
            label="Max width"
            min={10}
            max={40}
            step={0.5}
            unit="rem"
            value={state.sentence.maxWidth}
            onInput={(v) => update((s) => ((s.sentence.maxWidth = v), s))}
          />
          <Slider
            label="Line height"
            min={0.9}
            max={2}
            step={0.05}
            value={state.sentence.lineHeight}
            onInput={(v) => update((s) => ((s.sentence.lineHeight = v), s))}
          />
          <label className="sj__field">
            <span>Variable axes</span>
            <input
              className="sj__text"
              placeholder={'e.g. "SOFT" 100, "WONK" 1'}
              value={state.sentence.variation}
              onChange={(e) => update((s) => ((s.sentence.variation = e.currentTarget.value), s))}
            />
          </label>
          <p className="sj__hint">
            Axes: Fraunces SOFT 0–100, WONK 0–1, opsz · Recursive CASL 0–1, CRSV 0–1, slnt ·
            Shantell Sans INFM 0–100, BNCE −100–100 · Newsreader, Literata opsz.
          </p>
          <Slider
            label="Rotate"
            min={-8}
            max={8}
            step={0.1}
            unit="°"
            value={state.sentence.rotate}
            onInput={(v) => update((s) => ((s.sentence.rotate = v), s))}
          />
          <Slider
            label="Skew x"
            min={-15}
            max={15}
            step={0.1}
            unit="°"
            value={state.sentence.skewX}
            onInput={(v) => update((s) => ((s.sentence.skewX = v), s))}
          />
          <Slider
            label="Skew y"
            min={-8}
            max={8}
            step={0.1}
            unit="°"
            value={state.sentence.skewY}
            onInput={(v) => update((s) => ((s.sentence.skewY = v), s))}
          />
          <Slider
            label="Tilt back (3D x)"
            min={-45}
            max={45}
            step={0.5}
            unit="°"
            value={state.sentence.rotateX}
            onInput={(v) => update((s) => ((s.sentence.rotateX = v), s))}
          />
          <Slider
            label="Turn (3D y)"
            min={-45}
            max={45}
            step={0.5}
            unit="°"
            value={state.sentence.rotateY}
            onInput={(v) => update((s) => ((s.sentence.rotateY = v), s))}
          />
          <Slider
            label="Perspective"
            min={100}
            max={2000}
            step={10}
            unit="px"
            value={state.sentence.perspective}
            onInput={(v) => update((s) => ((s.sentence.perspective = v), s))}
          />
        </Section>

        <Section title="Texture" open>
          <Choice
            value={state.texture.kind}
            options={["none", "noise", "image"]}
            onChange={(v) =>
              update((s) => ((s.texture.kind = v as StyleState["texture"]["kind"]), s))
            }
          />
          {state.texture.kind === "noise" && (
            <>
              <Choice
                value={state.texture.noiseType}
                options={["fractalNoise", "turbulence"]}
                onChange={(v) =>
                  update(
                    (s) => ((s.texture.noiseType = v as StyleState["texture"]["noiseType"]), s),
                  )
                }
              />
              <Slider
                label="Frequency (grain)"
                min={0.005}
                max={2}
                step={0.005}
                value={state.texture.frequency}
                onInput={(v) => update((s) => ((s.texture.frequency = v), s))}
              />
              <Slider
                label="Octaves (detail)"
                min={1}
                max={8}
                step={1}
                value={state.texture.octaves}
                onInput={(v) => update((s) => ((s.texture.octaves = v), s))}
              />
            </>
          )}
          {state.texture.kind === "image" && (
            <label className="sj__field">
              <span>Image URL</span>
              <input
                className="sj__text"
                placeholder="/textures/paper.jpg"
                value={state.texture.url}
                onChange={(e) => update((s) => ((s.texture.url = e.currentTarget.value), s))}
              />
            </label>
          )}
          {state.texture.kind !== "none" && (
            <>
              <Slider
                label="Tile size"
                min={16}
                max={1024}
                step={8}
                unit="px"
                value={state.texture.tile}
                onInput={(v) => update((s) => ((s.texture.tile = v), s))}
              />
              <Slider
                label="Opacity"
                min={0}
                max={1}
                step={0.01}
                value={state.texture.opacity}
                onInput={(v) => update((s) => ((s.texture.opacity = v), s))}
              />
              <label className="sj__field">
                <span>Blend</span>
                <select
                  value={state.texture.blend}
                  onChange={(e) => update((s) => ((s.texture.blend = e.currentTarget.value), s))}
                >
                  {BLENDS.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
            </>
          )}
        </Section>

        <Section title="Cards and other colours" open>
          <Color
            label="Card"
            value={state.surfaces.card}
            onInput={(v) => update((s) => ((s.surfaces.card = v), s))}
          />
          <Slider
            label="Card opacity"
            min={0}
            max={1}
            step={0.01}
            value={state.surfaces.cardAlpha}
            onInput={(v) => update((s) => ((s.surfaces.cardAlpha = v), s))}
          />
          <Check
            label="Tint cards with the tone"
            checked={state.surfaces.cardTinted}
            onChange={(v) => update((s) => ((s.surfaces.cardTinted = v), s))}
          />
          <Choice
            value={state.surfaces.shadowColor}
            options={["black", "tone"]}
            onChange={(v) =>
              update(
                (s) => ((s.surfaces.shadowColor = v as StyleState["surfaces"]["shadowColor"]), s),
              )
            }
          />
          <Slider
            label="Key shadow opacity"
            min={0}
            max={1}
            step={0.01}
            value={state.surfaces.keyOpacity}
            onInput={(v) => update((s) => ((s.surfaces.keyOpacity = v), s))}
          />
          <Slider
            label="Key shadow offset"
            min={0}
            max={20}
            step={0.5}
            unit="px"
            value={state.surfaces.keyY}
            onInput={(v) => update((s) => ((s.surfaces.keyY = v), s))}
          />
          <Slider
            label="Key shadow blur"
            min={0}
            max={40}
            step={0.5}
            unit="px"
            value={state.surfaces.keyBlur}
            onInput={(v) => update((s) => ((s.surfaces.keyBlur = v), s))}
          />
          <Slider
            label="Ambient opacity"
            min={0}
            max={1}
            step={0.01}
            value={state.surfaces.ambientOpacity}
            onInput={(v) => update((s) => ((s.surfaces.ambientOpacity = v), s))}
          />
          <Slider
            label="Ambient offset"
            min={0}
            max={40}
            step={0.5}
            unit="px"
            value={state.surfaces.ambientY}
            onInput={(v) => update((s) => ((s.surfaces.ambientY = v), s))}
          />
          <Slider
            label="Ambient blur"
            min={0}
            max={80}
            step={1}
            unit="px"
            value={state.surfaces.ambientBlur}
            onInput={(v) => update((s) => ((s.surfaces.ambientBlur = v), s))}
          />
          <Slider
            label="Top edge highlight"
            min={0}
            max={0.5}
            step={0.01}
            value={state.surfaces.highlight}
            onInput={(v) => update((s) => ((s.surfaces.highlight = v), s))}
          />
          <Color
            label="Pay"
            value={state.surfaces.pay}
            onInput={(v) => update((s) => ((s.surfaces.pay = v), s))}
          />
          <Color
            label="Cleaning soon"
            value={state.surfaces.cleaningSoon}
            onInput={(v) => update((s) => ((s.surfaces.cleaningSoon = v), s))}
          />
          <Color
            label="Cleaning today"
            value={state.surfaces.cleaningToday}
            onInput={(v) => update((s) => ((s.surfaces.cleaningToday = v), s))}
          />
          <Color
            label="Dark text"
            value={state.surfaces.darkText}
            onInput={(v) => update((s) => ((s.surfaces.darkText = v), s))}
          />
        </Section>

        <Section title="App icon and About page" open>
          <Slider
            label="Icon size"
            min={1}
            max={3.5}
            step={0.05}
            unit="rem"
            value={state.about.iconSize}
            onInput={(v) => update((s) => ((s.about.iconSize = v), s))}
          />
          <Slider
            label="Icon corner radius"
            min={0}
            max={1.75}
            step={0.05}
            unit="rem"
            value={state.about.iconRadius}
            onInput={(v) => update((s) => ((s.about.iconRadius = v), s))}
          />
          <Slider
            label="Icon shadow blur"
            min={0}
            max={12}
            step={0.5}
            unit="px"
            value={state.about.iconShadowBlur}
            onInput={(v) => update((s) => ((s.about.iconShadowBlur = v), s))}
          />
          <Slider
            label="Icon shadow offset"
            min={0}
            max={8}
            step={0.5}
            unit="px"
            value={state.about.iconShadowY}
            onInput={(v) => update((s) => ((s.about.iconShadowY = v), s))}
          />
          <Slider
            label="Icon shadow opacity"
            min={0}
            max={1}
            step={0.01}
            value={state.about.iconShadowOpacity}
            onInput={(v) => update((s) => ((s.about.iconShadowOpacity = v), s))}
          />
          <Color
            label="Page background"
            value={state.about.background}
            onInput={(v) => update((s) => ((s.about.background = v), s))}
          />
          <Color
            label="Page text"
            value={state.about.text}
            onInput={(v) => update((s) => ((s.about.text = v), s))}
          />
          <Slider
            label="Title size"
            min={1}
            max={3.5}
            step={0.05}
            unit="rem"
            value={state.about.titleSize}
            onInput={(v) => update((s) => ((s.about.titleSize = v), s))}
          />
          <Slider
            label="Text size"
            min={0.75}
            max={1.5}
            step={0.025}
            unit="rem"
            value={state.about.bodySize}
            onInput={(v) => update((s) => ((s.about.bodySize = v), s))}
          />
          <Slider
            label="Top buttons text"
            min={0.6}
            max={1.2}
            step={0.025}
            unit="rem"
            value={state.about.actionSize}
            onInput={(v) => update((s) => ((s.about.actionSize = v), s))}
          />
          <Slider
            label="Top buttons tint"
            min={0}
            max={40}
            step={1}
            unit="%"
            value={state.about.actionTint}
            onInput={(v) => update((s) => ((s.about.actionTint = v), s))}
          />
          <Slider
            label="✕ tap area"
            min={2}
            max={6}
            step={0.1}
            unit="rem"
            value={state.about.closeSize}
            onInput={(v) => update((s) => ((s.about.closeSize = v), s))}
          />
          <Slider
            label="✕ size"
            min={0.8}
            max={4}
            step={0.05}
            unit="rem"
            value={state.about.closeGlyph}
            onInput={(v) => update((s) => ((s.about.closeGlyph = v), s))}
          />
          <Slider
            label="✕ thickness"
            min={1}
            max={6}
            step={0.1}
            value={state.about.closeThickness}
            onInput={(v) => update((s) => ((s.about.closeThickness = v), s))}
          />
        </Section>

        <Section title="Custom CSS">
          <p className="sj__hint">Laid over everything above. Any selector from app.css works.</p>
          <textarea
            className="sj__code"
            rows={10}
            spellcheck={false}
            value={state.customCss}
            onInput={(e) => update((s) => ((s.customCss = e.currentTarget.value), s))}
          />
        </Section>

        <Section title="Edit app.css">
          <p className="sj__hint">
            {state.appCss === null
              ? "The phones use app.css as it is on disk. Editing here replaces it in every phone."
              : "The phones use this edited copy instead of the file on disk."}
          </p>
          <textarea
            className="sj__code sj__code--tall"
            spellcheck={false}
            value={state.appCss ?? appCssSource}
            onInput={(e) => update((s) => ((s.appCss = e.currentTarget.value), s))}
          />
          <div className="sj__row">
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(state.appCss ?? appCssSource)}
            >
              Copy
            </button>
            <button
              type="button"
              disabled={state.appCss === null}
              onClick={() => update((s) => ((s.appCss = null), s))}
            >
              Back to the file
            </button>
          </div>
        </Section>

        <Section title="Generated CSS">
          <pre className="sj__code sj__code--out">{css}</pre>
        </Section>
      </aside>

      <main className="sj__stage">
        <div className="sj__stage-bar">
          <Slider label="Zoom" min={0.25} max={1} step={0.05} value={scale} onInput={setScale} />
          <label className="sj__field">
            <span>Screen</span>
            <select
              value={deviceIndex}
              onChange={(e) => setDeviceIndex(Number(e.currentTarget.value))}
            >
              {DEVICES.map((d, i) => (
                <option key={d.label} value={i}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)}>
            Reload phones
          </button>
          <div className="sj__chips">
            {STATES.map((s) => (
              <label key={s.id} className="sj__chip">
                <input
                  type="checkbox"
                  checked={shown.includes(s.id)}
                  onChange={(e) => {
                    const on = e.currentTarget.checked;
                    setShown((ids) => (on ? [...ids, s.id] : ids.filter((id) => id !== s.id)));
                  }}
                />
                {s.label}
              </label>
            ))}
          </div>
        </div>
        <div className="sj__phones">
          {STATES.filter((s) => shown.includes(s.id)).map((s) => (
            <figure key={s.id} className="sj__phone-wrap">
              <div
                className="sj__phone"
                style={{ width: device.width * scale, height: device.height * scale }}
              >
                <iframe
                  key={reloadKey}
                  className="sj__frame"
                  src="./frame.html"
                  title={s.label}
                  width={device.width}
                  height={device.height}
                  style={{ transform: `scale(${scale})` }}
                  ref={(el) => {
                    if (el) frames.current.set(s.id, el);
                    else frames.current.delete(s.id);
                  }}
                />
              </div>
              <figcaption>{s.label}</figcaption>
            </figure>
          ))}
        </div>
      </main>
    </div>
  );
}

type Update = (change: (s: StyleState) => StyleState) => void;

/** Sets one channel of every coloured tone to their average. Neutral keeps its own. */
const evenOut = (channel: "l" | "c") => (s: StyleState) => {
  const coloured = TONES.filter((t) => t !== "neutral");
  const mean = coloured.reduce((sum, t) => sum + s.tones[t][channel], 0) / coloured.length;
  for (const t of channel === "l" ? TONES : coloured)
    s.tones[t][channel] = Math.round(mean * 1000) / 1000;
  return s;
};

/** A slider track showing every hue at one lightness and chroma. */
function hueTrack(l: number, c: number): string {
  const stops = Array.from({ length: 13 }, (_, i) => toHex({ l, c, h: i * 30 }));
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

function ToneRow({ tone, state, update }: { tone: Tone; state: StyleState; update: Update }) {
  const spec = state.tones[tone];
  const r = resolveTone(state, tone);
  const whiteRatio = contrast(r.base, "#ffffff");
  const darkRatio = contrast(r.base, state.surfaces.darkText);
  const set = (key: "l" | "c" | "h", v: number) => update((s) => ((s.tones[tone][key] = v), s));
  return (
    <div className="sj__tone">
      <div className="sj__tone-head">
        <span className="sj__swatch" style={{ background: r.base, color: r.text }}>
          Aa
        </span>
        {state.background.mode !== "solid" && (
          <span className="sj__swatch sj__swatch--small" style={{ background: r.edge }} />
        )}
        <strong>{tone}</strong>
        <code>{r.base}</code>
        {r.clipped && (
          <span className="sj__warn" title="Outside sRGB; chroma was reduced to fit">
            ⚠ gamut
          </span>
        )}
      </div>
      <div
        className="sj__tone-text"
        title={`white ${whiteRatio.toFixed(1)} · dark ${darkRatio.toFixed(1)}`}
      >
        {(["text", "panelText"] as const).map((key) => {
          const ratio = contrast(r.base, r[key]);
          return (
            <label key={key}>
              {key === "text" ? "Page" : "Panel"}
              <select
                value={spec[key]}
                onChange={(e) =>
                  update(
                    (s) => ((s.tones[tone][key] = e.currentTarget.value as typeof spec.text), s),
                  )
                }
              >
                <option value="auto">auto</option>
                <option value="light">white</option>
                <option value="dark">dark</option>
              </select>
              <span className={`sj__ratio ${ratio < 4.5 ? "sj__ratio--low" : ""}`}>
                {ratio.toFixed(1)}:1
              </span>
            </label>
          );
        })}
      </div>
      <Slider
        label="L"
        min={0}
        max={1}
        step={0.005}
        value={spec.l}
        compact
        track={`linear-gradient(to right, ${toHex({ ...spec, l: 0.05 })}, ${toHex({ ...spec, l: 0.5 })}, ${toHex({ ...spec, l: 0.97 })})`}
        onInput={(v) => set("l", v)}
      />
      <Slider
        label="C"
        min={0}
        max={0.3}
        step={0.005}
        value={spec.c}
        compact
        track={`linear-gradient(to right, ${toHex({ ...spec, c: 0 })}, ${toHex({ ...spec, c: 0.3 })})`}
        onInput={(v) => set("c", v)}
      />
      <Slider
        label="H"
        min={0}
        max={360}
        step={1}
        value={spec.h}
        compact
        track={hueTrack(spec.l, spec.c)}
        onInput={(v) => set("h", v)}
      />
    </div>
  );
}

/**
 * The tones on an OKLCH hue wheel: angle is hue, distance from the centre is chroma. The
 * rings are the tones as set; the filled dots are where the global adjustments put them.
 * Drag a ring to change its tone's hue and chroma.
 */
function Wheel({ state, update }: { state: StyleState; update: Update }) {
  const size = 220;
  const radius = size / 2 - 8;
  const maxChroma = 0.25;
  const [dragging, setDragging] = useState<Tone | null>(null);
  const meanL = TONES.reduce((sum, t) => sum + effectiveTone(state, t).l, 0) / TONES.length;
  const conic = Array.from(
    { length: 37 },
    (_, i) => `${toHex({ l: meanL, c: 0.2, h: i * 10 })} ${i * 10}deg`,
  ).join(", ");
  const at = (h: number, c: number) => {
    const r = (Math.min(c, maxChroma) / maxChroma) * radius;
    const a = (h * Math.PI) / 180;
    return { x: size / 2 + r * Math.sin(a), y: size / 2 - r * Math.cos(a) };
  };
  const move = (e: PointerEvent) => {
    if (!dragging) return;
    const box = (e.currentTarget as SVGElement).getBoundingClientRect();
    const dx = e.clientX - box.left - size / 2;
    const dy = e.clientY - box.top - size / 2;
    const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    const c = Math.min(Math.hypot(dx, dy) / radius, 1) * maxChroma;
    update((s) => {
      s.tones[dragging].h = Math.round(h);
      s.tones[dragging].c = Math.round(c * 1000) / 1000;
      return s;
    });
  };
  return (
    <div className="sj__wheel" style={{ width: size, height: size }}>
      <div
        className="sj__wheel-disc"
        style={{
          inset: 8,
          background: `radial-gradient(closest-side, ${toHex({ l: meanL, c: 0, h: 0 })}, transparent), conic-gradient(${conic})`,
        }}
      />
      <svg
        width={size}
        height={size}
        onPointerMove={move}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
      >
        {state.global.pull > 0 &&
          (() => {
            const p = at(state.global.anchorHue, maxChroma);
            return (
              <line x1={size / 2} y1={size / 2} x2={p.x} y2={p.y} className="sj__wheel-anchor" />
            );
          })()}
        {TONES.map((tone) => {
          const spec = state.tones[tone];
          const eff = effectiveTone(state, tone);
          const own = at(spec.h, spec.c);
          const moved = at(eff.h, eff.c);
          return (
            <g key={tone}>
              <line x1={own.x} y1={own.y} x2={moved.x} y2={moved.y} className="sj__wheel-link" />
              <circle cx={moved.x} cy={moved.y} r={7} fill={toHex(eff)} className="sj__wheel-dot" />
              <circle
                cx={own.x}
                cy={own.y}
                r={10}
                className="sj__wheel-handle"
                onPointerDown={(e) => {
                  (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);
                  setDragging(tone);
                }}
              >
                <title>{tone}</title>
              </circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Section({
  title,
  open,
  children,
}: {
  title: string;
  open?: boolean;
  children: ComponentChildren;
}) {
  return (
    <details className="sj__section" open={open}>
      <summary>{title}</summary>
      <div className="sj__section-body">{children}</div>
    </details>
  );
}

function Slider(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
  track?: string;
  compact?: boolean;
  onInput(v: number): void;
}) {
  const digits = props.step < 0.01 ? 3 : props.step < 1 ? 2 : 0;
  return (
    <label className={`sj__field sj__slider ${props.compact ? "sj__slider--compact" : ""}`}>
      <span>{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        style={props.track ? { background: props.track } : undefined}
        className={props.track ? "sj__range--track" : undefined}
        onInput={(e) => props.onInput(Number(e.currentTarget.value))}
      />
      <input
        type="number"
        className="sj__number"
        step={props.step}
        value={Number(props.value.toFixed(digits))}
        onChange={(e) => props.onInput(Number(e.currentTarget.value))}
      />
      {props.unit && <span className="sj__unit">{props.unit}</span>}
    </label>
  );
}

function Color({
  label,
  value,
  onInput,
}: {
  label: string;
  value: string;
  onInput(v: string): void;
}) {
  return (
    <label className="sj__field sj__color">
      <span>{label}</span>
      <input type="color" value={value} onInput={(e) => onInput(e.currentTarget.value)} />
      <code>{value}</code>
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(v: boolean): void;
}) {
  return (
    <label className="sj__check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      {label}
    </label>
  );
}

function Choice({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange(v: string): void;
}) {
  return (
    <div className="sj__choice">
      {options.map((o) => (
        <button
          type="button"
          key={o}
          className={o === value ? "sj__choice--on" : ""}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

render(<StyleJig />, document.getElementById("style-jig")!);
