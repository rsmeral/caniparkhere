import { existsSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { describe } from "./describe";
import type { Status, UpcomingClosure } from "./query";

// Codepoints referenced anywhere in the app - describe()'s statuses plus app.tsx's
// hardcoded neutral (loading/error) states, which don't go through describe() at all.
const ALL_ICON_CODEPOINTS = ["23f3", "1f635", "1f937", "1f9ed", "1f61f", "1f642", "1f914", "1f60a"];

const upcoming: UpcomingClosure = { date: "2026-04-10", daysUntil: 3, streetName: "Bar St" };

suite("describe", () => {
  it("describes outOfArea without a warning, even when one was passed in", () => {
    const display = describe({ kind: "outOfArea" }, upcoming);
    expect(display.tone).toBe("outside");
    expect(display.icon).toBe("1f9ed");
    expect(display.warning).toBeNull();
  });

  it("returns a lowercase-hex icon codepoint for every status kind", () => {
    const statuses: Status[] = [
      { kind: "outOfArea" },
      { kind: "closure", streetName: null },
      { kind: "paidZone", pricePerHour: 1, dailyCapCzk: null, until: "00:00" },
      { kind: "residentZone" },
      { kind: "freeZoneRightNow" },
      { kind: "clear" },
    ];
    for (const status of statuses) {
      expect(describe(status).icon).toMatch(/^[0-9a-f]+$/);
    }
  });

  it("describes a closure without a warning, even when one was passed in", () => {
    const status: Status = { kind: "closure", streetName: "Foo St" };
    const display = describe(status, upcoming);
    expect(display.tone).toBe("danger");
    expect(display.sentence).toContain("Foo St");
    expect(display.warning).toBeNull();
  });

  it("describes a closure with no street name", () => {
    const display = describe({ kind: "closure", streetName: null });
    expect(display.sentence).toBe("Street cleaning today — don't park here.");
  });

  it("describes a paid zone with a cap", () => {
    const status: Status = { kind: "paidZone", pricePerHour: 40, dailyCapCzk: 90, until: "17:59" };
    const display = describe(status);
    expect(display.tone).toBe("warn");
    expect(display.sentence).toBe("Paid zone: 40 Kč/hod (max 90 Kč) until 17:59.");
  });

  it("describes a paid zone without a cap", () => {
    const status: Status = {
      kind: "paidZone",
      pricePerHour: 20,
      dailyCapCzk: null,
      until: "23:59",
    };
    const display = describe(status);
    expect(display.sentence).toBe("Paid zone: 20 Kč/hod until 23:59.");
  });

  it("describes a resident zone and includes an upcoming-closure warning when present", () => {
    const display = describe({ kind: "residentZone" }, upcoming);
    expect(display.tone).toBe("caution");
    expect(display.warning).toBe("Heads up: street cleaning on Bar St in 3 days.");
  });

  it("describes freeZoneRightNow", () => {
    const display = describe({ kind: "freeZoneRightNow" });
    expect(display.tone).toBe("good");
  });

  it("describes clear", () => {
    const display = describe({ kind: "clear" });
    expect(display.tone).toBe("good");
    expect(display.warning).toBeNull();
  });

  it("uses 'tomorrow' phrasing for a 1-day-out warning", () => {
    const display = describe(
      { kind: "clear" },
      { date: "2026-04-08", daysUntil: 1, streetName: null },
    );
    expect(display.warning).toBe("Heads up: street cleaning tomorrow.");
  });

  it("has a downloaded SVG for every icon codepoint used in the app", () => {
    for (const codepoint of ALL_ICON_CODEPOINTS) {
      expect(existsSync(new URL(`../public/emoji/${codepoint}.svg`, import.meta.url))).toBe(true);
    }
  });
});
