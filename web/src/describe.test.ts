import { existsSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { describe } from "./describe";
import type { Cleaning, Place, ZoneInfo, ZoneStatus } from "./query";
import type { Vehicle } from "./vehicle";

// Codepoints referenced anywhere in the app - describe()'s advice plus app.tsx's
// hardcoded neutral (loading/error) states, which don't go through describe() at all.
const ALL_ICON_CODEPOINTS = [
  "23f3",
  "1f635",
  "1f937",
  "1f512",
  "1f6f0",
  "1f9ed",
  "1f61f",
  "1f642",
  "1f914",
  "1f60a",
  "1f440",
  "1f9d0",
];

const mixZone: ZoneInfo = { code: "P2-0237", category: "MIX" };
const resZone: ZoneInfo = { code: "P8-0012", category: "RES" };
const visZone: ZoneInfo = { code: "BUS-0001", category: "VIS" };

const NO_CLEANING: Cleaning = { today: false, upcoming: null };
const CLEANING_TODAY: Cleaning = { today: true, upcoming: null };
const cleaningIn = (daysUntil: number): Cleaning => ({
  today: false,
  upcoming: { date: "2026-04-10", daysUntil },
});

const paid = (zone: ZoneInfo, rules: Partial<ZoneStatus> = {}): ZoneStatus =>
  ({
    kind: "paidZone",
    pricePerHour: 40,
    dailyCapCzk: 90,
    maxStayMinutes: null,
    from: "08:00",
    until: "17:59",
    ...zone,
    ...rules,
  }) as ZoneStatus;

const place = (zone: ZoneStatus | null, extra: Partial<Place> = {}): Place => ({
  zone,
  streetName: null,
  cleaning: NO_CLEANING,
  distanceMeters: 0,
  ...extra,
});

const at = (places: Place[], vehicle?: Vehicle) => describe({ kind: "places", places }, vehicle);

const NO_INFO = "I don't have parking info for this spot — better check the signs around you.";
const COULD_BE = "Where are you exactly? Seems like one of these.";

suite("describe", () => {
  it("describes being outside Prague with no cards", () => {
    const display = describe({ kind: "outOfArea" });
    expect(display).toMatchObject({ tone: "outside", icon: "1f9ed", cards: [] });
  });

  suite("one place", () => {
    it("describes a paid zone plainly, with its price, cap and hours on the card", () => {
      const display = at([place(paid(visZone), { streetName: "Nerudova" })]);
      expect(display).toMatchObject({
        tone: "warn",
        sentence: "You can park here, but it's paid.",
        agree: true,
      });
      expect(display.cards).toEqual([
        {
          key: "BUS-0001",
          streetName: "Nerudova",
          zone: {
            code: "BUS-0001",
            categoryLabel: "Visitors",
            colorHex: "#f97316",
            colorName: "oranžová",
            payment: { url: "https://platba.parkujvpraze.cz/pz/BUS-0001", priceLabel: "40 Kč/hod" },
            expanded: [
              { label: "Price", value: "40 Kč/hod" },
              { label: "Daily cap", value: "90 Kč" },
              { label: "Hours", value: "08:00–17:59" },
            ],
          },
          cleaning: null,
          advice: { tone: "warn", icon: "1f642", sentence: "You can park here, but it's paid." },
        },
      ]);
    });

    it("says 'No cap' for a paid zone without one", () => {
      const [card] = at([place(paid(mixZone, { dailyCapCzk: null }))]).cards;
      expect(card.zone?.expanded?.[1]).toEqual({ label: "Daily cap", value: "No cap" });
    });

    it("names a resident zone's max stay in the sentence and on the card", () => {
      const display = at([place(paid(resZone, { maxStayMinutes: 60 }))]);
      expect(display.sentence).toBe("You can park here for up to 1 hour, but it's paid.");
      expect(display.cards[0].zone?.expanded?.[1]).toEqual({ label: "Max stay", value: "1 hour" });
      expect(at([place(paid(resZone, { maxStayMinutes: 180 }))]).sentence).toBe(
        "You can park here for up to 3 hours, but it's paid.",
      );
    });

    it("describes a resident zone's unknown max stay as a short time, and points to the sign", () => {
      const display = at([place(paid(resZone))]);
      expect(display.sentence).toBe("You can park here for a short time, but it's paid.");
      expect(display.cards[0].zone?.expanded?.[1]).toEqual({
        label: "Max stay",
        value: "1–3 h, see sign",
      });
    });

    it("describes a zone outside its paid hours as free, with nothing to pay or open", () => {
      const display = at([place({ kind: "freeZoneRightNow", ...resZone })]);
      expect(display).toMatchObject({
        tone: "good",
        sentence: "You're in a paid zone, but right now it's free to park.",
      });
      expect(display.cards[0].zone).toMatchObject({ payment: null, expanded: null });
    });

    it("describes a resident-only zone", () => {
      const display = at([place({ kind: "residentZone", ...resZone })]);
      expect(display).toMatchObject({
        tone: "caution",
        sentence: "This is a resident-only zone, so you might need a permit to park here.",
      });
      expect(display.cards[0].zone).toMatchObject({ payment: null, expanded: null });
    });

    it("says there's no info where there's no zone, with the street on a card", () => {
      const display = at([place(null, { streetName: "Nerudova" })]);
      expect(display).toMatchObject({ tone: "neutral", icon: "1f440", sentence: NO_INFO });
      expect(display.cards).toMatchObject([
        { key: "street:Nerudova", streetName: "Nerudova", zone: null },
      ]);
    });

    it("shows no card for a place with nothing to show", () => {
      expect(at([place(null)]).cards).toEqual([]);
    });

    it("warns against parking on cleaning day, and marks the card", () => {
      const display = at([
        place(paid(mixZone), { streetName: "Foo St", cleaning: CLEANING_TODAY }),
      ]);
      expect(display).toMatchObject({
        tone: "danger",
        icon: "1f61f",
        sentence: "There's street cleaning here today — don't park here.",
      });
      expect(display.cards[0].cleaning).toEqual({ label: "Street cleaning today", today: true });
      expect(display.cards[0].zone).toMatchObject({
        payment: null,
        expanded: [{ label: "Price" }, {}, {}],
      });
    });

    it("folds upcoming cleaning into the sentence, and marks the card", () => {
      const tomorrow = at([place(paid(mixZone), { cleaning: cleaningIn(1) })]);
      expect(tomorrow.sentence).toBe(
        "You can park here, but it's paid. And watch out, street cleaning tomorrow.",
      );
      expect(tomorrow.cards[0].cleaning).toEqual({
        label: "Street cleaning tomorrow",
        today: false,
      });
      expect(at([place(null, { cleaning: cleaningIn(3) })]).sentence).toBe(
        `${NO_INFO} And watch out, street cleaning in 3 days.`,
      );
    });
  });

  suite("several places", () => {
    it("answers confidently when they have the same consequences, whatever their colour", () => {
      const display = at([
        place(paid(mixZone), { streetName: "Úvoz" }),
        place(paid(visZone), { streetName: "Nerudova", distanceMeters: 12 }),
      ]);
      expect(display).toMatchObject({
        tone: "warn",
        sentence: "You can park here, but it's paid.",
        agree: true,
      });
      expect(display.cards.map((c) => c.key)).toEqual(["P2-0237", "BUS-0001"]);
    });

    it("says it could be any of them when their price differs", () => {
      const display = at([place(paid(mixZone)), place(paid(visZone, { pricePerHour: 60 }))]);
      expect(display).toMatchObject({
        tone: "caution",
        icon: "1f9d0",
        sentence: COULD_BE,
        agree: false,
      });
    });

    it("counts a time limit as a different consequence from a daily cap", () => {
      expect(at([place(paid(mixZone)), place(paid(resZone, { dailyCapCzk: 90 }))]).agree).toBe(
        false,
      );
    });

    it("gives each card the advice its place would get alone", () => {
      const display = at([
        place({ kind: "freeZoneRightNow", ...mixZone }),
        place({ kind: "residentZone", ...resZone }),
      ]);
      expect(display.cards.map((c) => c.advice)).toEqual([
        at([place({ kind: "freeZoneRightNow", ...mixZone })]).cards[0].advice,
        {
          tone: "caution",
          icon: "1f914",
          sentence: "This is a resident-only zone, so you might need a permit to park here.",
        },
      ]);
    });

    it("doesn't let a place with no known rules contradict one that has them", () => {
      const display = at([
        place(paid(mixZone)),
        place(null, { streetName: "Úvoz", distanceMeters: 20 }),
      ]);
      expect(display).toMatchObject({ sentence: "You can park here, but it's paid.", agree: true });
      expect(display.cards).toHaveLength(2);
    });

    it("answers from the nearest place with known rules", () => {
      const display = at([
        place(null, { streetName: "Úvoz" }),
        place(paid(mixZone), { distanceMeters: 5 }),
      ]);
      expect(display.sentence).toBe("You can park here, but it's paid.");
    });

    it("says there might be cleaning today when only some of them are cleaned", () => {
      const display = at([
        place(paid(mixZone), { cleaning: CLEANING_TODAY }),
        place(paid(mixZone, { code: "P2-0238" })),
      ]);
      expect(display).toMatchObject({
        tone: "danger",
        sentence: "Where are you exactly? Some of these have street cleaning today.",
        agree: false,
      });
      expect(display.cards.map((c) => c.cleaning?.today ?? false)).toEqual([true, false]);
    });

    it("warns plainly when every one of them is cleaned today", () => {
      const display = at([
        place(paid(mixZone), { cleaning: CLEANING_TODAY }),
        place(null, { streetName: "Úvoz", cleaning: CLEANING_TODAY }),
      ]);
      expect(display).toMatchObject({
        sentence: "There's street cleaning here today — don't park here.",
        agree: true,
      });
    });

    it("calls upcoming cleaning 'possible' when only some of them have it", () => {
      const display = at([
        place(paid(mixZone), { cleaning: cleaningIn(1) }),
        place(paid(mixZone, { code: "X" })),
      ]);
      expect(display.sentence).toBe(
        "You can park here, but it's paid. And watch out, possible street cleaning tomorrow.",
      );
    });

    it("keeps upcoming cleaning out of the cards' own advice", () => {
      const display = at([
        place(paid(mixZone), { cleaning: cleaningIn(1) }),
        place(paid(visZone, { pricePerHour: 60 })),
      ]);
      expect(display.sentence).toBe(
        `${COULD_BE} And watch out, possible street cleaning tomorrow.`,
      );
      expect(display.cards[0].advice.sentence).toBe("You can park here, but it's paid.");
    });
  });

  suite("in a shared car", () => {
    const paidMix = paid(mixZone, { dailyCapCzk: 400 });
    const paidRes = paid(resZone, { maxStayMinutes: 60 });
    const paidVis = paid(visZone);

    it("lets the rental end in a blue or purple zone at any hour, with no price shown", () => {
      const zones: ZoneStatus[] = [
        paidMix,
        paidRes,
        { kind: "residentZone", ...resZone },
        { kind: "freeZoneRightNow", ...mixZone },
      ];
      for (const zone of zones) {
        const display = at([place(zone)], "shared");
        expect(display).toMatchObject({
          tone: "good",
          sentence: "You can end your rental here, for free and with no time limit.",
        });
        expect(display.cards[0].zone).toMatchObject({ payment: null, expanded: null });
      }
    });

    it("agrees across blue and purple zones, since the rental can end in either", () => {
      expect(at([place(paidMix), place(paidRes)], "shared").agree).toBe(true);
    });

    it("keeps an orange zone's price and Pay button for a stop during the rental", () => {
      const display = at([place(paidVis)], "shared");
      expect(display).toMatchObject({
        tone: "caution",
        sentence:
          "You can't end your rental here. You can stop here during the rental, but it's paid.",
      });
      expect(display.cards[0].zone?.payment?.priceLabel).toBe("40 Kč/hod");
    });

    it("says an orange zone outside its paid hours still isn't somewhere to end the rental", () => {
      expect(at([place({ kind: "freeZoneRightNow", ...visZone })], "shared").sentence).toBe(
        "You can't end your rental here. You can stop here during the rental, and right now it's free.",
      );
    });

    it("points to the carsharing app where there's no zone data", () => {
      expect(at([place(null, { cleaning: cleaningIn(1) })], "shared").sentence).toBe(
        "I don't have parking info for this spot — check your carsharing app before you end the rental here." +
          " And watch out, street cleaning tomorrow.",
      );
    });

    it("warns about street cleaning today just as for an own car", () => {
      const places = [place(paidMix, { cleaning: CLEANING_TODAY })];
      expect(at(places, "shared").sentence).toBe(at(places).sentence);
    });
  });

  it("uses a lowercase-hex icon codepoint for every answer, each with a downloaded SVG", () => {
    const displays = [
      describe({ kind: "outOfArea" }),
      at([place(null)]),
      at([place(paid(mixZone))]),
      at([place({ kind: "residentZone", ...resZone })]),
      at([place({ kind: "freeZoneRightNow", ...mixZone })]),
      at([place(null, { cleaning: CLEANING_TODAY })]),
      at([place(paid(mixZone)), place(paid(visZone, { pricePerHour: 60 }))]),
    ];
    for (const display of displays) {
      expect(display.icon).toMatch(/^[0-9a-f]+$/);
      expect(ALL_ICON_CODEPOINTS).toContain(display.icon);
    }
    for (const codepoint of ALL_ICON_CODEPOINTS) {
      expect(existsSync(new URL(`../public/emoji/${codepoint}.svg`, import.meta.url))).toBe(true);
    }
  });
});
