import { describe, expect, it } from "vitest";
import { maxStayMinutesByCode } from "./golemio.js";

const tariff = (id: string, ...durations: (number | null)[]) => ({
  id,
  charge_bands: durations.map((maximum_duration) => ({ maximum_duration })),
});

describe("maxStayMinutesByCode", () => {
  it("keys each zone section's limit by its zone code, in minutes", () => {
    const result = maxStayMinutesByCode(
      [
        { id: "tsk2-P1-0101", tariff: "centre" },
        { id: "tsk2-P6-0001", tariff: "outer" },
      ],
      [tariff("centre", 3600), tariff("outer", 10800)],
    );
    expect(result).toEqual(
      new Map([
        ["P1-0101", 60],
        ["P6-0001", 180],
      ]),
    );
  });

  it("takes the strictest limit when a tariff has several bands", () => {
    const result = maxStayMinutesByCode(
      [{ id: "tsk2-P2-0001", tariff: "t" }],
      [tariff("t", 10800, null, 3600)],
    );
    expect(result.get("P2-0001")).toBe(60);
  });

  it("leaves out sections with no tariff, an unknown tariff, or no limit", () => {
    const result = maxStayMinutesByCode(
      [
        { id: "tsk2-A", tariff: null },
        { id: "tsk2-B", tariff: "missing" },
        { id: "tsk2-C", tariff: "unlimited" },
        { id: "other-D", tariff: "centre" },
      ],
      [tariff("unlimited", null), tariff("centre", 3600)],
    );
    expect(result.size).toBe(0);
  });
});
