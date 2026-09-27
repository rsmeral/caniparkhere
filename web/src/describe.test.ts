import { existsSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { consequenceOf, describe, sameConsequence } from "./describe";
import { emojiUrl } from "./emoji";
import type { Cleaning, Place, ZoneInfo, ZoneStatus } from "./query";
import type { Change } from "./tariffLogic";
import type { Vehicle } from "./vehicle";

// Every emoji the app shows - describe()'s advice plus app.tsx's loading and error states,
// which don't go through describe() at all.
const ALL_EMOJI = ["⏳", "😵", "🤷", "🔒", "🛰", "🧭", "😟", "🤑", "🤔", "😊", "👀", "🧐", "⏰"];

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
    paidUntil: { time: "18:00", daysAhead: 0, weekday: 2, minutesUntil: 120, rule: null },
    paidWindows: ["08:00–17:59"],
    ...zone,
    ...rules,
  }) as ZoneStatus;

const NEXT_RULE = { days: [3], start: "08:00", end: "19:59", pricePerHour: 40, dailyCapCzk: 400 };
const TOMORROW_8: Change = {
  time: "08:00",
  daysAhead: 1,
  weekday: 3,
  minutesUntil: 600,
  rule: NEXT_RULE,
};
const free = (
  zone: ZoneInfo,
  paidFrom: Change | null = TOMORROW_8,
  maxStayMinutes: number | null = null,
): ZoneStatus => ({
  kind: "freeZoneRightNow",
  paidFrom,
  paidWindows: paidFrom ? ["08:00–19:59"] : [],
  maxStayMinutes,
  ...zone,
});

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
    expect(display).toMatchObject({ tone: "outside", icon: "🧭", cards: [] });
  });

  suite("one place", () => {
    it("describes a paid zone plainly, with its price, cap and hours on the card", () => {
      const display = at([place(paid(visZone), { streetName: "Nerudova" })]);
      expect(display).toMatchObject({
        tone: "warn",
        icon: "🤑",
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
              { label: "Zone", value: "Visitors" },
              { label: "Price", value: "40 Kč/hod" },
              { label: "Daily cap", value: "90 Kč" },
              { label: "Paid hours", value: "08:00–17:59" },
            ],
          },
          terms: "40 Kč/h until 18:00 · max 90 Kč/day",
          cleaning: null,
          advice: { tone: "warn", icon: "🤑", sentence: "You can park here, but it's paid." },
        },
      ]);
    });

    it("says 'No cap' for a paid zone without one", () => {
      const [card] = at([place(paid(mixZone, { dailyCapCzk: null }))]).cards;
      expect(card.zone?.expanded?.[2]).toEqual({ label: "Daily cap", value: "No cap" });
    });

    it("names a resident zone's max stay in the sentence and on the card", () => {
      const display = at([place(paid(resZone, { maxStayMinutes: 60 }))]);
      expect(display.sentence).toBe("You can park here for up to 1 hour, but it's paid.");
      expect(display.cards[0].zone?.expanded?.[2]).toEqual({ label: "Max stay", value: "1 h" });
      expect(at([place(paid(resZone, { maxStayMinutes: 180 }))]).sentence).toBe(
        "You can park here for up to 3 hours, but it's paid.",
      );
    });

    it("describes a resident zone's unknown max stay as a short time, and points to the sign", () => {
      const display = at([place(paid(resZone))]);
      expect(display.sentence).toBe("You can park here for a short time, but it's paid.");
      expect(display.cards[0].zone?.expanded?.[2]).toEqual({
        label: "Max stay",
        value: "1–3 h, see sign",
      });
    });

    it("describes a zone outside its paid hours as free, with its next paid terms to open", () => {
      const display = at([place(free(resZone))]);
      expect(display).toMatchObject({
        tone: "good",
        sentence: "You're in a paid zone, but right now it's free to park.",
      });
      expect(display.cards[0].zone).toMatchObject({
        payment: null,
        expanded: [
          { label: "Zone", value: "Residents" },
          { label: "Free until", value: "08:00" },
          { label: "Then", value: "40 Kč/hod" },
          { label: "Max stay", value: "1–3 h, see sign" },
          { label: "Paid hours", value: "08:00–19:59" },
        ],
      });
      expect(at([place(free(mixZone, null))]).cards[0].zone?.expanded).toEqual([
        { label: "Zone", value: "Mixed" },
        { label: "Free", value: "At all hours" },
      ]);
    });

    it("describes a resident-only zone", () => {
      const display = at([place({ kind: "residentZone", ...resZone })]);
      expect(display).toMatchObject({
        tone: "caution",
        sentence: "This is a resident-only zone, so you might need a permit to park here.",
      });
      expect(display.cards[0].zone).toMatchObject({
        payment: null,
        expanded: [
          { label: "Zone", value: "Residents" },
          { label: "Parking", value: "Permit holders only" },
        ],
      });
    });

    it("says there's no info where there's no zone, with the street on a card", () => {
      const display = at([place(null, { streetName: "Nerudova" })]);
      expect(display).toMatchObject({ tone: "neutral", icon: "👀", sentence: NO_INFO });
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
        icon: "😟",
        sentence: "There's street cleaning here today — don't park here.",
      });
      expect(display.cards[0].cleaning).toEqual({ label: "Street cleaning today", today: true });
      expect(display.cards[0].zone).toMatchObject({
        payment: null,
        expanded: [{ label: "Zone" }, { label: "Price" }, {}, {}],
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

  suite("terms on the card", () => {
    const termsOf = (zone: ZoneStatus | null, vehicle?: Vehicle, extra: Partial<Place> = {}) =>
      at([place(zone, extra)], vehicle).cards[0]?.terms;

    it("says until when free parking lasts", () => {
      expect(termsOf(free(mixZone))).toBe("Free until 08:00");
      expect(
        termsOf(
          free(mixZone, { time: "07:30", daysAhead: 0, weekday: 2, minutesUntil: 90, rule: null }),
        ),
      ).toBe("Free until 07:30");
      expect(
        termsOf(
          free(mixZone, {
            time: "08:00",
            daysAhead: 3,
            weekday: 0,
            minutesUntil: 3000,
            rule: null,
          }),
        ),
      ).toBe("Free until Mon 08:00");
      expect(termsOf(free(mixZone, null))).toBe("Free at all hours");
    });

    it("gives paid parking's price, until when it lasts, and its limit", () => {
      expect(termsOf(paid(mixZone, { dailyCapCzk: null }))).toBe("40 Kč/h until 18:00");
      expect(termsOf(paid(resZone, { maxStayMinutes: 60 }))).toBe("40 Kč/h until 18:00 · max 1 h");
      expect(termsOf(paid(resZone))).toBe("40 Kč/h until 18:00 · limit on the sign");
      expect(termsOf(paid(mixZone, { paidUntil: null }))).toBe(
        "40 Kč/h at all hours · max 90 Kč/day",
      );
      const midnight = { time: "00:00", daysAhead: 1, weekday: 3, minutesUntil: 300, rule: null };
      expect(termsOf(paid(mixZone, { dailyCapCzk: null, paidUntil: midnight }))).toBe(
        "40 Kč/h until midnight",
      );
    });

    it("says a resident-only zone needs a permit", () => {
      expect(termsOf({ kind: "residentZone", ...resZone })).toBe("Permit needed");
    });

    it("says whether a shared car's rental can end there", () => {
      expect(termsOf(paid(mixZone), "shared")).toBe("Rental can end here");
      expect(termsOf(paid(visZone), "shared")).toBe("Can't end rental here");
    });

    it("leaves the terms to the cleaning mark on a cleaning day, and has none without a zone", () => {
      expect(termsOf(paid(mixZone), "own", { cleaning: CLEANING_TODAY })).toBeNull();
      expect(termsOf(null, "own", { streetName: "Úvoz" })).toBeNull();
    });
  });

  suite("free parking that's about to end", () => {
    it("says so in the headline when less than an hour is left", () => {
      const soon = free(mixZone, {
        time: "08:00",
        daysAhead: 0,
        weekday: 2,
        minutesUntil: 45,
        rule: null,
      });
      expect(at([place(soon)])).toMatchObject({
        tone: "warn",
        icon: "⏰",
        sentence: "You can park here for free now, but not for long — it's paid from 08:00.",
      });
    });

    it("keeps the plain free headline with an hour or more left", () => {
      const later = free(mixZone, {
        time: "08:00",
        daysAhead: 0,
        weekday: 2,
        minutesUntil: 60,
        rule: null,
      });
      expect(at([place(later)])).toMatchObject({
        tone: "good",
        sentence: "You're in a paid zone, but right now it's free to park.",
      });
    });

    it("counts a different start of paid hours as a different consequence", () => {
      const at7 = free(mixZone, {
        time: "07:00",
        daysAhead: 1,
        weekday: 3,
        minutesUntil: 540,
        rule: null,
      });
      expect(at([place(free(mixZone)), place(at7)]).agree).toBe(false);
      expect(at([place(free(mixZone)), place(free(visZone))]).agree).toBe(true);
    });
  });

  it("gives every zone's card a table to open", () => {
    const zones: ZoneStatus[] = [
      paid(mixZone),
      free(visZone),
      free(mixZone, null),
      { kind: "residentZone", ...resZone },
    ];
    for (const vehicle of ["own", "shared"] as const) {
      for (const zone of zones) {
        expect(
          at([place(zone)], vehicle).cards[0].zone?.expanded.length,
          `${zone.kind} ${vehicle}`,
        ).toBeGreaterThan(0);
      }
    }
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
        icon: "🧐",
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
      const display = at([place(free(mixZone)), place({ kind: "residentZone", ...resZone })]);
      expect(display.cards.map((c) => c.advice)).toEqual([
        at([place(free(mixZone))]).cards[0].advice,
        {
          tone: "caution",
          icon: "🤔",
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

  suite("consequences", () => {
    const same = (a: Place, b: Place, vehicle: Vehicle = "own") =>
      sameConsequence(consequenceOf(a, vehicle)!, consequenceOf(b, vehicle)!);

    it("has none for a place with no zone and no cleaning today", () => {
      expect(consequenceOf(place(null, { streetName: "Úvoz" }), "own")).toBeNull();
    });

    it("treats zones of different colours with the same terms as the same", () => {
      expect(same(place(paid(mixZone)), place(paid(visZone)))).toBe(true);
    });

    it("tells zones apart by price, cap and hours", () => {
      expect(same(place(paid(mixZone)), place(paid(mixZone, { pricePerHour: 60 })))).toBe(false);
      expect(same(place(paid(mixZone)), place(paid(mixZone, { dailyCapCzk: null })))).toBe(false);
      expect(same(place(paid(mixZone)), place(paid(mixZone, { until: "19:59" })))).toBe(false);
    });

    it("tells a resident zone's unknown time limit apart from no limit at all", () => {
      expect(consequenceOf(place(paid(resZone)), "own")).toMatchObject({
        terms: { maxStay: "unknown" },
      });
      expect(same(place(paid(resZone)), place(paid(mixZone)))).toBe(false);
      expect(same(place(paid(resZone, { maxStayMinutes: 60 })), place(paid(resZone)))).toBe(false);
    });

    it("treats cleaning today as the same whatever the zone", () => {
      const cleaned = (zone: ZoneStatus | null) => place(zone, { cleaning: CLEANING_TODAY });
      expect(same(cleaned(paid(mixZone)), cleaned(null))).toBe(true);
    });

    it("in a shared car, treats blue and purple alike and an orange zone's stop by its terms", () => {
      expect(same(place(paid(resZone)), place(free(mixZone)), "shared")).toBe(true);
      expect(same(place(paid(visZone)), place(free(visZone)), "shared")).toBe(false);
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
        free(mixZone),
      ];
      for (const zone of zones) {
        const display = at([place(zone)], "shared");
        expect(display).toMatchObject({
          tone: "good",
          sentence: "You can end your rental here, for free and with no time limit.",
        });
        expect(display.cards[0].zone).toMatchObject({
          payment: null,
          expanded: [
            { label: "Zone", value: expect.any(String) },
            { label: "End rental", value: "Free, no time limit" },
          ],
        });
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
      expect(display.cards[0].zone?.expanded[1]).toEqual({
        label: "End rental",
        value: "Not here",
      });
    });

    it("says an orange zone outside its paid hours still isn't somewhere to end the rental", () => {
      expect(at([place(free(visZone))], "shared").sentence).toBe(
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

  it("uses only known emoji, each with a downloaded Twemoji SVG", () => {
    const displays = [
      describe({ kind: "outOfArea" }),
      at([place(null)]),
      at([place(paid(mixZone))]),
      at([place({ kind: "residentZone", ...resZone })]),
      at([place(free(mixZone))]),
      at([place(null, { cleaning: CLEANING_TODAY })]),
      at([place(paid(mixZone)), place(paid(visZone, { pricePerHour: 60 }))]),
    ];
    for (const display of displays) {
      expect(ALL_EMOJI).toContain(display.icon);
    }
    for (const emoji of ALL_EMOJI) {
      expect(existsSync(new URL(`../public${emojiUrl(emoji)}`, import.meta.url)), emoji).toBe(true);
    }
  });
});
