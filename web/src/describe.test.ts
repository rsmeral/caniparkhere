import { describe as suite, expect, it } from "vitest";
import { describe } from "./describe";
import type { Status, UpcomingClosure } from "./query";

const upcoming: UpcomingClosure = { date: "2026-04-10", daysUntil: 3, streetName: "Bar St" };

suite("describe", () => {
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
});
