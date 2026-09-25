import { describe, expect, it } from "vitest";
import { formatScenarioHash, parseScenarioHash, shiftLocalTime, toLocalTime } from "./scenario";

const pin = { lon: 14.4378, lat: 50.0755, accuracyMeters: 20 };

describe("scenario hash", () => {
  it("round-trips a scenario at the real time", () => {
    const scenario = { pin, time: null };
    expect(parseScenarioHash(formatScenarioHash(scenario))).toEqual(scenario);
  });

  it("round-trips a scenario at a set time", () => {
    const scenario = { pin, time: "2026-09-26T21:30" };
    expect(formatScenarioHash(scenario)).toBe("#50.07550,14.43780,20,2026-09-26T21:30");
    expect(parseScenarioHash(formatScenarioHash(scenario))).toEqual(scenario);
  });

  it("rejects anything that isn't three numbers and an optional time", () => {
    expect(parseScenarioHash("")).toBeNull();
    expect(parseScenarioHash("#50.07,14.43")).toBeNull();
    expect(parseScenarioHash("#50.07,abc,20")).toBeNull();
    expect(parseScenarioHash("#50.07,14.43,20,tomorrow")).toBeNull();
    expect(parseScenarioHash("#50.07,14.43,20,2026-09-26T21:30,x")).toBeNull();
  });
});

describe("local time", () => {
  it("formats a Date the way a datetime-local input does", () => {
    expect(toLocalTime(new Date(2026, 8, 6, 7, 5))).toBe("2026-09-06T07:05");
  });

  it("shifts across midnight", () => {
    expect(shiftLocalTime("2026-09-26T23:30", 60)).toBe("2026-09-27T00:30");
    expect(shiftLocalTime("2026-09-27T00:30", -60)).toBe("2026-09-26T23:30");
  });
});
