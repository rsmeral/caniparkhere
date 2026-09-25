import { existsSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { describe } from "./describe";
import type { Status, UpcomingClosure, ZoneInfo, ZoneStatus } from "./query";

// Codepoints referenced anywhere in the app - describe()'s statuses plus app.tsx's
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

const upcomingIn3Days: UpcomingClosure = { date: "2026-04-10", daysUntil: 3, streetName: "Bar St" };
const upcomingTomorrow: UpcomingClosure = { date: "2026-04-08", daysUntil: 1, streetName: "Foo St" };
const mixZone: ZoneInfo = { code: "P2-0237", category: "MIX" };
const resZone: ZoneInfo = { code: "P8-0012", category: "RES" };
const visZone: ZoneInfo = { code: "BUS-0001", category: "VIS" };

suite("describe", () => {
  it("describes outOfArea with no detail, even when an upcoming closure was passed in", () => {
    const display = describe({ kind: "outOfArea" }, upcomingIn3Days);
    expect(display.tone).toBe("outside");
    expect(display.icon).toBe("1f9ed");
    expect(display.detail).toBeNull();
  });

  it("returns a lowercase-hex icon codepoint for every status kind", () => {
    const statuses: Status[] = [
      { kind: "outOfArea" },
      { kind: "closure", streetName: null },
      {
        kind: "paidZone",
        pricePerHour: 1,
        dailyCapCzk: null,
        from: "00:00",
        until: "00:00",
        streetName: null,
        ...visZone,
      },
      { kind: "residentZone", streetName: null, ...resZone },
      { kind: "freeZoneRightNow", streetName: null, ...mixZone },
      { kind: "clear", streetName: null },
      { kind: "ambiguous", streetName: null, candidates: [] },
    ];
    for (const status of statuses) {
      expect(describe(status).icon).toMatch(/^[0-9a-f]+$/);
    }
  });

  it("describes a closure with the street name in the detail card, not the sentence, and ignores any upcoming closure", () => {
    const status: Status = { kind: "closure", streetName: "Foo St" };
    const display = describe(status, upcomingIn3Days);
    expect(display.tone).toBe("danger");
    expect(display.sentence).toBe("There's street cleaning here today — don't park here.");
    expect(display.detail).toEqual({ streetName: "Foo St", zone: null, candidateZones: null });
  });

  it("describes a closure with no street name and no detail card", () => {
    const display = describe({ kind: "closure", streetName: null });
    expect(display.sentence).toBe("There's street cleaning here today — don't park here.");
    expect(display.detail).toBeNull();
  });

  it("describes a paid zone with a cap, a payable+expandable detail card, and a plain sentence with no price/time", () => {
    const status: Status = {
      kind: "paidZone",
      pricePerHour: 40,
      dailyCapCzk: 90,
      from: "08:00",
      until: "17:59",
      streetName: "Nerudova",
      ...visZone,
    };
    const display = describe(status);
    expect(display.tone).toBe("warn");
    expect(display.sentence).toBe("You can park here, but it's paid.");
    expect(display.detail).toEqual({
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
      candidateZones: null,
    });
  });

  it("describes a paid zone without a cap - same plain sentence, 'No cap' in the expanded rows", () => {
    const status: Status = {
      kind: "paidZone",
      pricePerHour: 20,
      dailyCapCzk: null,
      from: "00:00",
      until: "23:59",
      streetName: null,
      ...mixZone,
    };
    const display = describe(status);
    expect(display.sentence).toBe("You can park here, but it's paid.");
    expect(display.detail?.zone?.expanded).toEqual([
      { label: "Price", value: "20 Kč/hod" },
      { label: "Daily cap", value: "No cap" },
      { label: "Hours", value: "00:00–23:59" },
    ]);
  });

  it("describes a resident zone's tariff hours as a short paid stay, with a max-stay row", () => {
    const status: Status = {
      kind: "paidZone",
      pricePerHour: 60,
      dailyCapCzk: null,
      from: "08:00",
      until: "05:59",
      streetName: "Slezská",
      ...resZone,
    };
    const display = describe(status);
    expect(display.tone).toBe("warn");
    expect(display.sentence).toBe("Visitors can park here for a short time, but it's paid.");
    expect(display.detail?.zone).toEqual({
      code: "P8-0012",
      categoryLabel: "Residents",
      colorHex: "#2563eb",
      colorName: "modrá",
      payment: { url: "https://platba.parkujvpraze.cz/pz/P8-0012", priceLabel: "60 Kč/hod" },
      expanded: [
        { label: "Price", value: "60 Kč/hod" },
        { label: "Max stay", value: "1–3 h, see sign" },
        { label: "Hours", value: "08:00–05:59" },
      ],
    });
  });

  it("describes a resident zone outside its tariff hours as free, like any other zone", () => {
    const display = describe({ kind: "freeZoneRightNow", streetName: null, ...resZone });
    expect(display.tone).toBe("good");
    expect(display.sentence).toBe("You're in a paid zone, but right now it's free to park.");
  });

  it("gives a resident candidate in its tariff hours the short-stay advice", () => {
    const [candidate] = describe({
      kind: "ambiguous",
      streetName: null,
      candidates: [
        {
          kind: "paidZone",
          pricePerHour: 60,
          dailyCapCzk: null,
          from: "08:00",
          until: "05:59",
          streetName: null,
          ...resZone,
        },
      ],
    }).detail!.candidateZones!;
    expect(candidate).toMatchObject({
      tone: "warn",
      sentence: "Visitors can park here for a short time, but it's paid.",
    });
  });

  it("describes a resident zone with a non-payable, non-expandable detail card", () => {
    const display = describe({ kind: "residentZone", streetName: null, ...resZone });
    expect(display.tone).toBe("caution");
    expect(display.sentence).toBe(
      "This is a resident-only zone, so you might need a permit to park here.",
    );
    expect(display.detail).toEqual({
      streetName: null,
      zone: {
        code: "P8-0012",
        categoryLabel: "Residents",
        colorHex: "#2563eb",
        colorName: "modrá",
        payment: null,
        expanded: null,
      },
      candidateZones: null,
    });
  });

  it("describes freeZoneRightNow with a non-payable, non-expandable detail card", () => {
    const display = describe({ kind: "freeZoneRightNow", streetName: null, ...mixZone });
    expect(display.tone).toBe("good");
    expect(display.detail?.zone?.payment).toBeNull();
    expect(display.detail).toEqual({
      streetName: null,
      zone: {
        code: "P2-0237",
        categoryLabel: "Mixed",
        colorHex: "#8b5cf6",
        colorName: "fialová",
        payment: null,
        expanded: null,
      },
      candidateZones: null,
    });
  });

  it("describes clear with a friendly, non-committal sentence and no detail card when nothing is known", () => {
    const display = describe({ kind: "clear", streetName: null });
    expect(display.tone).toBe("neutral");
    expect(display.sentence).toBe(
      "I don't have parking info for this spot — better check the signs around you.",
    );
    expect(display.detail).toBeNull();
  });

  it("shows the street name in clear's detail card when one is known", () => {
    const display = describe({ kind: "clear", streetName: "Nerudova" });
    expect(display.detail).toEqual({ streetName: "Nerudova", zone: null, candidateZones: null });
  });

  it("folds an upcoming closure into the sentence, never the detail card, with no street name", () => {
    const tomorrow = describe({ kind: "clear", streetName: null }, upcomingTomorrow);
    expect(tomorrow.sentence).toBe(
      "I don't have parking info for this spot — better check the signs around you." +
        " And watch out, street cleaning tomorrow.",
    );
    expect(tomorrow.detail).toBeNull();

    const in3Days = describe({ kind: "clear", streetName: null }, upcomingIn3Days);
    expect(in3Days.sentence).toBe(
      "I don't have parking info for this spot — better check the signs around you." +
        " And watch out, street cleaning in 3 days.",
    );
  });

  it("appends the upcoming-closure clause to the plain paid-zone sentence", () => {
    const status: Status = {
      kind: "paidZone",
      pricePerHour: 40,
      dailyCapCzk: 90,
      from: "08:00",
      until: "17:59",
      streetName: null,
      ...visZone,
    };
    const display = describe(status, upcomingTomorrow);
    expect(display.sentence).toBe(
      "You can park here, but it's paid. And watch out, street cleaning tomorrow.",
    );
  });

  it("appends the upcoming-closure clause after any other content in the detail card", () => {
    const status: Status = { kind: "residentZone", streetName: "Nerudova", ...resZone };
    const display = describe(status, upcomingTomorrow);
    expect(display.sentence).toBe(
      "This is a resident-only zone, so you might need a permit to park here." +
        " And watch out, street cleaning tomorrow.",
    );
    expect(display.detail).toEqual({
      streetName: "Nerudova",
      zone: {
        code: "P8-0012",
        categoryLabel: "Residents",
        colorHex: "#2563eb",
        colorName: "modrá",
        payment: null,
        expanded: null,
      },
      candidateZones: null,
    });
  });

  it("suppresses the upcoming-closure clause for closure and outOfArea, since it's redundant", () => {
    expect(describe({ kind: "closure", streetName: null }, upcomingTomorrow).sentence).toBe(
      "There's street cleaning here today — don't park here.",
    );
    expect(describe({ kind: "outOfArea" }, upcomingTomorrow).sentence).toBe(
      "This app only covers Prague — looks like you're somewhere else.",
    );
  });

  it("describes an ambiguous location with a candidate chip per zone, sorted as given, no single zone", () => {
    const candidates: ZoneStatus[] = [
      { kind: "freeZoneRightNow", streetName: "Nerudova", ...mixZone },
      {
        kind: "paidZone",
        pricePerHour: 40,
        dailyCapCzk: null,
        from: "08:00",
        until: "17:59",
        streetName: "Nerudova",
        ...visZone,
      },
    ];
    const display = describe({ kind: "ambiguous", streetName: "Nerudova", candidates });
    expect(display.tone).toBe("caution");
    expect(display.sentence).toBe(
      "Your location isn't precise enough to tell exactly which zone you're in — could be any of these.",
    );
    expect(display.detail?.zone).toBeNull();
    expect(display.detail?.candidateZones).toEqual([
      {
        code: "P2-0237",
        categoryLabel: "Mixed",
        colorHex: "#8b5cf6",
        colorName: "fialová",
        payment: null,
        expanded: null,
        tone: "good",
        icon: "1f60a",
        sentence: "You're in a paid zone, but right now it's free to park.",
      },
      {
        code: "BUS-0001",
        categoryLabel: "Visitors",
        colorHex: "#f97316",
        colorName: "oranžová",
        payment: { url: "https://platba.parkujvpraze.cz/pz/BUS-0001", priceLabel: "40 Kč/hod" },
        expanded: [
          { label: "Price", value: "40 Kč/hod" },
          { label: "Daily cap", value: "No cap" },
          { label: "Hours", value: "08:00–17:59" },
        ],
        tone: "warn",
        icon: "1f642",
        sentence: "You can park here, but it's paid.",
      },
    ]);
  });

  it("gives a candidate the same advice that zone would get as a confident answer", () => {
    const status: ZoneStatus = { kind: "paidZone", pricePerHour: 40, dailyCapCzk: null,
      from: "08:00", until: "17:59", streetName: "Nerudova", ...visZone };
    const alone = describe(status);
    const [candidate] = describe({
      kind: "ambiguous", streetName: "Nerudova", candidates: [status],
    }).detail!.candidateZones!;

    expect(candidate.tone).toBe(alone.tone);
    expect(candidate.icon).toBe(alone.icon);
    expect(candidate.sentence).toBe(alone.sentence);
  });

  it("gives a resident candidate its advice even though it has no price rows to show", () => {
    const [candidate] = describe({
      kind: "ambiguous",
      streetName: "Tovačovského",
      candidates: [{ kind: "residentZone", streetName: "Tovačovského", ...resZone }],
    }).detail!.candidateZones!;

    expect(candidate).toMatchObject({
      tone: "caution",
      icon: "1f914",
      sentence: "This is a resident-only zone, so you might need a permit to park here.",
      payment: null,
      expanded: null,
    });
  });

  it("keeps the upcoming-closure clause out of candidate sentences, leaving it in the headline", () => {
    const display = describe(
      {
        kind: "ambiguous",
        streetName: "Nerudova",
        candidates: [{ kind: "residentZone", streetName: "Nerudova", ...resZone }],
      },
      upcomingTomorrow,
    );

    expect(display.sentence).toContain("street cleaning tomorrow");
    expect(display.detail!.candidateZones![0].sentence).not.toContain("street cleaning");
  });

  it("appends the upcoming-closure clause to the ambiguous sentence too", () => {
    const display = describe(
      { kind: "ambiguous", streetName: null, candidates: [] },
      upcomingTomorrow,
    );
    expect(display.sentence).toBe(
      "Your location isn't precise enough to tell exactly which zone you're in — could be any of these." +
        " And watch out, street cleaning tomorrow.",
    );
  });

  it("has a downloaded SVG for every icon codepoint used in the app", () => {
    for (const codepoint of ALL_ICON_CODEPOINTS) {
      expect(existsSync(new URL(`../public/emoji/${codepoint}.svg`, import.meta.url))).toBe(true);
    }
  });
});
