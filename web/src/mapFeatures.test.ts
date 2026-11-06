import { describe, expect, it } from "vitest";
import { iconsOf, mapFeatures } from "./mapFeatures";
import type { MapArea, ZoneStatus } from "./query";

const geometry = { type: "MultiPolygon" as const, coordinates: [] };

const zone = (status: ZoneStatus): MapArea["zones"][number] => ({
  type: "Feature",
  geometry,
  properties: { status },
});

const paid: ZoneStatus = {
  kind: "paidZone",
  code: "P2-0101",
  category: "VIS",
  areas: [],
  pricePerHour: 60,
  dailyCapCzk: null,
  maxStayMinutes: null,
  from: "08:00",
  until: "19:59",
  paidUntil: null,
  paidWindows: ["08:00–19:59"],
};

const residents: ZoneStatus = {
  kind: "residentZone",
  code: "P2-0102",
  category: "RES",
  areas: ["2"],
};

const area: MapArea = {
  zones: [zone(paid), zone(residents)],
  cleaning: [
    {
      type: "Feature",
      geometry,
      properties: { cleaning: { today: true, upcoming: null } },
    },
  ],
};

describe("mapFeatures", () => {
  it("draws each zone in its curb colour with its advice's emoji", () => {
    const { zones } = mapFeatures(area, "own", [], [], null);
    expect(zones.features.map((f) => f.properties)).toEqual([
      { code: "P2-0101", color: "#f97316", icon: "🤑", candidate: false, selected: false },
      { code: "P2-0102", color: "#2563eb", icon: "🤔", candidate: false, selected: false },
    ]);
  });

  it("gives the emoji for the vehicle and permits", () => {
    const { zones } = mapFeatures(area, "permit", ["2"], [], null);
    expect(zones.features.map((f) => f.properties.icon)).toEqual(["🤑", "😎"]);
  });

  it("marks the zones the position could be in, and the one tapped", () => {
    const { zones } = mapFeatures(area, "own", [], ["P2-0102"], "P2-0101");
    expect(zones.features.map((f) => [f.properties.candidate, f.properties.selected])).toEqual([
      [false, true],
      [true, false],
    ]);
  });

  it("lists each emoji once, with the cleaning one when a section is cleaned today", () => {
    expect(iconsOf(mapFeatures(area, "own", [], [], null)).sort()).toEqual(
      ["😟", "🤑", "🤔"].sort(),
    );
  });
});
