import { describe, expect, it } from "vitest";
import { accuracyBars } from "./accuracy";

describe("accuracyBars", () => {
  it("gives four bars up to 10m and one past 50m", () => {
    expect([5, 10, 11, 25, 26, 50, 51, 500].map(accuracyBars)).toEqual([4, 4, 3, 3, 2, 2, 1, 1]);
  });
});
