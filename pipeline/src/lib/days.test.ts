import { describe, expect, it } from "vitest";
import { expandDayRange } from "./days";

describe("expandDayRange", () => {
  it("expands a Mon-first range", () => {
    expect(expandDayRange("Po-Pá")).toEqual([0, 1, 2, 3, 4]);
  });

  it("expands a single day", () => {
    expect(expandDayRange("So")).toEqual([5]);
  });

  it("expands a short two-day range", () => {
    expect(expandDayRange("So-Ne")).toEqual([5, 6]);
  });

  it("expands the full week", () => {
    expect(expandDayRange("Po-Ne")).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
