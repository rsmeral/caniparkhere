import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import "./app.css";
import { AboutButton } from "./components/About";
import { CandidateBox } from "./components/CandidateBox";
import { CardSquares } from "./components/CardSquares";
import { LiveIndicator } from "./components/LiveIndicator";
import { MapPanel } from "./components/MapPanel";
import { MapHandle } from "./components/MapHandle";
import { PermitSheet } from "./components/PermitSheet";
import { VehiclePicker } from "./components/VehiclePicker";
import { ZoneBox } from "./components/ZoneBox";
import { accuracyBars } from "./accuracy";
import { describe, type Display } from "./describe";
import { emojiUrl } from "./emoji";
import type { QueryResult } from "./query";
import { createQueryClient } from "./queryClient";
import type { GeoState } from "./useGeolocation";
import { useScrollFades } from "./useScrollFades";
import { useThemeColor } from "./useThemeColor";
import { loadPermits, savePermits } from "./permits";
import { loadVehicle, saveVehicle, type Vehicle } from "./vehicle";
import { loadMapConsent, loadMapOpened, saveMapConsent, saveMapOpened } from "./mapConsent";
import { fadeIn, fadeOut, moveFrom } from "./mapSwap";
import type { MapPalette } from "./mapStyle";
import { swipeDirection, type Point } from "./swipe";

const neutral = (icon: string, sentence: string): Display => ({
  tone: "neutral",
  icon,
  sentence,
  cards: [],
  agree: true,
});

interface Props {
  geo: GeoState;
  /** The moment to answer for. Left out, each answer is for the time it's worked out. */
  now?: Date;
  /** Treat every street-cleaning section as cleaned today. For simulating in the jig. */
  cleaningEverywhereToday?: boolean;
  /** Told when the user pauses or resumes following the location, so the caller can stop
   * and restart whatever supplies it. */
  onPausedChange?: (paused: boolean) => void;
  /** The map's colours, for tuning them in the style jig. */
  mapPalette?: MapPalette;
}

/**
 * The whole screen, for whatever location and time it's given. Where those come from is up
 * to the caller: the browser's GPS and clock in the real app, or the controls in the jig.
 */
export function App({
  geo: liveGeo,
  now,
  cleaningEverywhereToday = false,
  onPausedChange,
  mapPalette,
}: Props) {
  // Spinning the worker up on first render starts its data load immediately, alongside the
  // browser's search for a GPS fix.
  const client = useMemo(() => createQueryClient(), []);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle>(loadVehicle);
  const [permits, setPermits] = useState<string[]>(loadPermits);
  const [permitSheetOpen, setPermitSheetOpen] = useState(false);
  const [mapConsent, setMapConsent] = useState(loadMapConsent);
  const [mapShown, setMapShown] = useState(false);
  // The card picked from the squares over the map, by key.
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [mapOpenedBefore, setMapOpenedBefore] = useState(loadMapOpened);
  // Told once a change to mapShown is in the page, before it's painted.
  const mapShownCommitted = useRef<(() => void) | null>(null);
  const mapSwapping = useRef(false);
  // Everything above the map's handle.
  const main = useRef<HTMLDivElement>(null);
  // The cards, which scroll on their own when there are more than fit.
  const cardsList = useRef<HTMLDivElement>(null);
  // Where a touch on the page started, for telling a swipe from a scroll or a tap.
  const touchStart = useRef<{ point: Point; target: Element; scrolledToEnd: boolean } | null>(null);
  // Every area a permit can be for, asked of the worker the first time the page opens.
  const [permitAreas, setPermitAreas] = useState<string[] | null>(null);
  // While paused, the answer stays with the position it was paused at - where the car is,
  // once the user walks away from it.
  const [pausedGeo, setPausedGeo] = useState<GeoState | null>(null);
  const geo = pausedGeo ?? liveGeo;

  const togglePaused = () => {
    const pausing = pausedGeo === null;
    setPausedGeo(pausing ? liveGeo : null);
    onPausedChange?.(pausing);
  };

  const switchVehicle = (picked: Vehicle) => {
    setVehicle(picked);
    saveVehicle(picked);
  };

  // A permit with no areas picked yet starts by picking them; the vehicle switches once
  // they're saved.
  const pickVehicle = (picked: Vehicle) => {
    if (picked === "permit" && permits.length === 0) setPermitSheetOpen(true);
    else switchVehicle(picked);
  };

  const savePermitAreas = (saved: string[]) => {
    setPermits(saved);
    savePermits(saved);
    setPermitSheetOpen(false);
    if (saved.length > 0) switchVehicle("permit");
    else if (vehicle === "permit") switchVehicle("own");
  };

  useEffect(() => {
    if (!permitSheetOpen || permitAreas !== null) return;
    client.areas().then(setPermitAreas, (err) => setDataError((err as Error).message));
  }, [permitSheetOpen, permitAreas, client]);

  useEffect(() => () => client.terminate(), [client]);

  // The effect below depends on the timestamp, not the Date, so a new Date for the same
  // moment doesn't ask again.
  const nowMs = now?.getTime();

  // Each fix is resolved by the worker. `live` drops an answer whose location has already
  // been superseded, since replies can land in a different order than they were asked for.
  useEffect(() => {
    if (geo.status !== "ready") return;
    let live = true;
    client
      .query(geo.lon, geo.lat, geo.accuracyMeters, { at: now, cleaningEverywhereToday })
      .then((r) => {
        if (live) setResult(r);
      })
      .catch((err) => {
        // The screen says only that it couldn't connect; the reason goes to the console.
        console.error(err);
        if (live) setDataError((err as Error).message);
      });
    return () => {
      live = false;
    };
  }, [client, geo, nowMs, cleaningEverywhereToday]);

  const display: Display = useMemo(() => {
    if (dataError) {
      return neutral("😵", "Can't connect. Your internet sucks, or I messed up. Try later.");
    }
    if (geo.status === "unsupported") {
      return neutral("🤷", "This device can't share its location.");
    }
    if (geo.status === "denied") {
      return neutral("🔒", "Can't tell you, 'cause you won't let me see you.");
    }
    if (geo.status === "unavailable") {
      return neutral("🛰", "Can't tell you, 'cause I can't see where you are.");
    }
    if (geo.status === "searching" || !result) {
      return neutral("⏳", "Figuring out where you are...");
    }
    return describe(result, vehicle, permits);
  }, [result, geo, dataError, vehicle, permits]);

  useThemeColor(display.tone);

  const cardsKey = display.cards.map((c) => c.key).join(",");

  // Collapse back down whenever the set of cards changes, so an expanded card from a
  // previous location doesn't linger after moving.
  useEffect(() => {
    setExpandedKey(null);
    setPickedKey(null);
  }, [cardsKey]);

  const toggleExpanded = (key: string) =>
    setExpandedKey((current) => (current === key ? null : key));

  // The map is there whenever there are cards to swap it for. Until the map has been opened
  // once, the handle nudges towards it when the position is unclear: a weak fix, or more than
  // one place it could be.
  const mapAvailable = geo.status === "ready" && display.cards.length > 0;
  const mapOpen = mapAvailable && mapShown;
  const mapHelps =
    mapAvailable && (accuracyBars(geo.accuracyMeters) < 3 || display.cards.length > 1);

  useLayoutEffect(() => {
    mapShownCommitted.current?.();
    mapShownCommitted.current = null;
  }, [mapShown]);

  // The cards fade out moving the swipe's way, then the map and the squares fade in moving
  // the same way into place, while the emoji and the sentence move to their new places; and
  // the reverse on closing. See mapSwap.ts.
  const showMap = async (show: boolean) => {
    if (show === mapShown || mapSwapping.current) return;
    if (show && !mapOpenedBefore) {
      setMapOpenedBefore(true);
      saveMapOpened();
    }
    const page = main.current;
    if (!page || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMapShown(show);
      return;
    }
    mapSwapping.current = true;
    const direction = show ? -1 : 1;
    const all = (selector: string) => [...page.querySelectorAll(selector)];
    await fadeOut(all(show ? ".app__cards" : ".app__squares, .app__map"), direction);
    const emoji = page.querySelector(".app__emoji-halo")!;
    const sentence = page.querySelector(".app__sentence")!;
    const before = [emoji.getBoundingClientRect(), sentence.getBoundingClientRect()];
    await new Promise<void>((resolve) => {
      mapShownCommitted.current = resolve;
      setMapShown(show);
    });
    moveFrom(emoji, before[0], true);
    moveFrom(sentence, before[1], false);
    fadeIn(all(show ? ".app__squares, .app__map" : ".app__cards"), direction);
    mapSwapping.current = false;
  };

  const answerMapConsent = (accepted: boolean) => {
    if (!accepted) {
      showMap(false);
      return;
    }
    setMapConsent(true);
    saveMapConsent();
  };

  // A swipe up anywhere opens the map, once the cards are scrolled to their end, so it doesn't
  // take over scrolling a long list of them. A swipe down off the map closes it; on the map,
  // dragging moves the map. Neither counts on a page opened over the app.
  const onTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0];
    const list = cardsList.current;
    touchStart.current =
      e.touches.length === 1
        ? {
            point: { x: touch.clientX, y: touch.clientY },
            target: e.target as Element,
            scrolledToEnd: !list || list.scrollTop + list.clientHeight >= list.scrollHeight - 2,
          }
        : null;
  };

  const onTouchEnd = (e: TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = e.changedTouches[0];
    if (!start || !touch || start.target.closest("dialog")) return;
    const end = { x: touch.clientX, y: touch.clientY };
    const direction = swipeDirection(start.point, end, window.innerHeight);
    if (direction === "up" && !mapOpen && mapAvailable && start.scrolledToEnd) showMap(true);
    if (direction === "down" && mapOpen && !start.target.closest(".app__map")) showMap(false);
  };

  useScrollFades(cardsList, "app__cards", `${cardsKey}:${mapOpen}`);

  // The zones' rules change with the time, so the map asks for them again each minute, or
  // whenever the moment being answered for changes.
  const mapRefreshKey = `${nowMs ?? Math.floor(Date.now() / 60_000)}:${cleaningEverywhereToday}`;

  return (
    <div
      className={`app app--${display.tone}${mapAvailable ? " app--has-map" : ""}${mapOpen ? " app--map" : ""}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="app__main" ref={main}>
        <LiveIndicator geo={geo} paused={pausedGeo !== null} onToggle={togglePaused} />
        <div className="app__corner">
          <VehiclePicker
            vehicle={vehicle}
            onChange={pickVehicle}
            onEditPermits={() => setPermitSheetOpen(true)}
          />
          <AboutButton />
        </div>
        <PermitSheet
          open={permitSheetOpen}
          areas={permitAreas}
          permits={permits}
          onSave={savePermitAreas}
          onClose={() => setPermitSheetOpen(false)}
        />
        <div className="app__emoji-halo">
          <img className="app__emoji" src={emojiUrl(display.icon)} alt="" />
        </div>
        <p className="app__sentence">{display.sentence}</p>
        {mapOpen && geo.status === "ready" ? (
          <>
            <CardSquares cards={display.cards} pickedKey={pickedKey} onPick={setPickedKey} />
            <MapPanel
              position={geo}
              consented={mapConsent}
              onConsent={answerMapConsent}
              client={client}
              options={{ at: now, cleaningEverywhereToday }}
              refreshKey={mapRefreshKey}
              vehicle={vehicle}
              permits={permits}
              candidates={display.cards.flatMap((card) => (card.zone ? [card.zone.code] : []))}
              palette={mapPalette}
              pickedCard={display.cards.find((card) => card.key === pickedKey) ?? null}
              onPickedCardClose={() => setPickedKey(null)}
            />
          </>
        ) : (
          display.cards.length > 0 && (
            <div className="app__cards" ref={cardsList}>
              {display.cards.map((card) => {
                const Box = display.agree ? ZoneBox : CandidateBox;
                return (
                  <Box
                    key={card.key}
                    card={card}
                    expanded={expandedKey === card.key}
                    onToggle={() => toggleExpanded(card.key)}
                  />
                );
              })}
            </div>
          )
        )}
      </div>
      {mapAvailable && (
        <div className="app__footer">
          <MapHandle
            open={mapOpen}
            nudge={mapHelps && !mapOpen && !mapOpenedBefore}
            onToggle={() => showMap(!mapOpen)}
          />
        </div>
      )}
    </div>
  );
}
