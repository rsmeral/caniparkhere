import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LoadedData } from "./dataStore";
import { describe as describeResult } from "./describe";
import { buildIndexes, queryPlaces } from "./query";

// Spots from real use of the jig, checked against the data committed in public/data. A data
// refresh that changes one of these zones fails here, which is worth a look either way.

function load(name: string) {
  return JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url), "utf8"));
}

const data: LoadedData = {
  zps: load("zps"),
  letni: load("letni"),
  streets: load("streets"),
  bounds: load("manifest").bounds,
};
const indexes = buildIndexes(data);

// A Wednesday, clear of public holidays and of street cleaning at these spots.
const WEDNESDAY_EVENING = new Date(2026, 8, 30, 19, 13);

/** The cards a spot shows, as "zone street", nearest first, and whether there's any answer. */
function cardsAt(lat: number, lon: number, accuracyMeters: number, at = WEDNESDAY_EVENING) {
  const places = queryPlaces(data, indexes, lon, lat, at, accuracyMeters);
  return {
    answered: places.some((p) => p.zone || p.cleaning.today),
    cards: places.map((p) => [p.zone?.code, p.streetName].filter(Boolean).join(" ")),
  };
}

/** The headline a spot gets. */
function headlineAt(lat: number, lon: number, accuracyMeters: number, at = WEDNESDAY_EVENING) {
  const places = queryPlaces(data, indexes, lon, lat, at, accuracyMeters);
  return describeResult({ kind: "places", places }).sentence;
}

/** Points about `meters` away from (lat, lon) in eight directions. */
function around(lat: number, lon: number, meters: number): [number, number][] {
  const dLat = meters / 111_320;
  const dLon = meters / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [-1, 0, 1].flatMap((i) =>
    [-1, 0, 1]
      .filter((j) => i !== 0 || j !== 0)
      .map((j): [number, number] => [lat + i * dLat, lon + j * dLon]),
  );
}

const SPOTS = {
  p4InnerParking: [50.05986, 14.43698, 10],
  oldrichova: [50.06599, 14.42908, 28],
  namestiMiru: [50.0755, 14.4378, 8],
  boleslavova: [50.06391, 14.43451, 10],
  myslikova: [50.07759, 14.41712, 30],
} as const;

describe("real spots", () => {
  it("names the street of a zone set back inside a block", () => {
    expect(cardsAt(...SPOTS.p4InnerParking).cards).toEqual(["P4-2105 Táborská"]);
  });

  it("answers for a zone the circle reaches when the pin is just outside it", () => {
    expect(cardsAt(...SPOTS.oldrichova).cards).toEqual(["P2-0281 Oldřichova"]);
  });

  it("finds the zone and street on a square", () => {
    expect(cardsAt(...SPOTS.namestiMiru).cards).toEqual(["P2-0420 náměstí Míru"]);
  });

  it("names the street where there's no zone", () => {
    expect(cardsAt(...SPOTS.boleslavova)).toEqual({ answered: false, cards: ["Boleslavova"] });
  });

  it("names each zone's own street when the circle reaches several", () => {
    expect(cardsAt(...SPOTS.myslikova).cards).toEqual([
      "P2-0101 Myslíkova",
      "P1-0397 Myslíkova",
      "P2-0108 Na zbořenci",
    ]);
  });

  it("answers confidently when two zones on a square have the same rules", () => {
    const [lat, lon] = SPOTS.namestiMiru;
    expect(cardsAt(lat, lon, 20).cards).toEqual(["P2-0420 náměstí Míru", "P2-0427 náměstí Míru"]);
    expect(headlineAt(lat, lon, 20)).toBe("You can park here, but it's paid.");
  });

  it("warns about Myslíkova's cleaning day, plainly for a precise fix and as a maybe for a wide one", () => {
    const [lat, lon] = SPOTS.myslikova;
    const cleaningDay = new Date(2026, 9, 3, 10, 0);
    expect(headlineAt(lat, lon, 5, cleaningDay)).toBe(
      "There's street cleaning here today — don't park here.",
    );
    expect(headlineAt(lat, lon, 30, cleaningDay)).toBe(
      "Where are you exactly? Some of these have street cleaning today.",
    );
    expect(headlineAt(lat, lon, 5, new Date(2026, 9, 2, 10, 0))).toBe(
      "You can park here, but it's paid. And watch out, street cleaning tomorrow.",
    );
  });

  it("doesn't lose its answer when the pin moves a metre", () => {
    for (const [name, [lat, lon, accuracy]] of Object.entries(SPOTS)) {
      const here = cardsAt(lat, lon, accuracy);
      for (const [nearLat, nearLon] of around(lat, lon, 1)) {
        expect(cardsAt(nearLat, nearLon, accuracy).answered, name).toBe(here.answered);
      }
    }
  });

  it("never loses a zone when the circle grows", () => {
    for (const [name, [lat, lon, accuracy]] of Object.entries(SPOTS)) {
      const zones = (r: number) => cardsAt(lat, lon, r).cards.map((c) => c.split(" ")[0]);
      const small = zones(accuracy);
      const large = zones(accuracy + 20);
      for (const code of small.filter((c) => /^[A-Z0-9]+-\d+$/.test(c))) {
        expect(large, name).toContain(code);
      }
    }
  });
});
