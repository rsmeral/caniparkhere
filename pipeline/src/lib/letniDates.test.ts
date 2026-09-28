import { describe, expect, it } from "vitest";
import { parseLetniDates } from "./letniDates";

describe("parseLetniDates", () => {
  it("parses two comma-separated dates into ISO format", () => {
    expect(parseLetniDates("07.04.2026, 05.10.2026")).toEqual(["2026-04-07", "2026-10-05"]);
  });

  it("parses a single date", () => {
    expect(parseLetniDates("20.09.2026")).toEqual(["2026-09-20"]);
  });
});
