import { describe, expect, it } from "vitest";
import { buildDictionary } from "./dictionary.js";

describe("buildDictionary", () => {
  it("dedupes repeated values and preserves first-seen order", () => {
    const { table, indexes } = buildDictionary(["a", "b", "a", "c", "b"]);
    expect(table).toEqual(["a", "b", "c"]);
    expect(indexes).toEqual([0, 1, 0, 2, 1]);
  });

  it("passes null values through as null indexes without adding to the table", () => {
    const { table, indexes } = buildDictionary(["a", null, "a", null]);
    expect(table).toEqual(["a"]);
    expect(indexes).toEqual([0, null, 0, null]);
  });

  it("dedupes structurally-equal non-string values (e.g. date arrays)", () => {
    const { table, indexes } = buildDictionary([
      ["2026-04-07", "2026-10-05"],
      ["2026-05-25"],
      ["2026-04-07", "2026-10-05"],
    ]);
    expect(table).toEqual([["2026-04-07", "2026-10-05"], ["2026-05-25"]]);
    expect(indexes).toEqual([0, 1, 0]);
  });

  it("returns empty table/indexes for empty input", () => {
    expect(buildDictionary([])).toEqual({ table: [], indexes: [] });
  });
});
