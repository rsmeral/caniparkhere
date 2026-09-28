import { describe, expect, it, vi } from "vitest";
import { parseTariffText } from "./tariff";

describe("parseTariffText", () => {
  it("returns null for blank/whitespace-only text", () => {
    expect(parseTariffText("")).toBeNull();
    expect(parseTariffText("   ")).toBeNull();
  });

  it("parses a single clause with a cap", () => {
    expect(parseTariffText("Po-Pá 08:00-17:59 20Kč/hod (max. 90 Kč)")).toEqual([
      { days: [0, 1, 2, 3, 4], start: "08:00", end: "17:59", pricePerHour: 20, dailyCapCzk: 90 },
    ]);
  });

  it("parses a single clause without a cap", () => {
    expect(parseTariffText("Po-Ne 00:00-23:59 40Kč/hod")).toEqual([
      {
        days: [0, 1, 2, 3, 4, 5, 6],
        start: "00:00",
        end: "23:59",
        pricePerHour: 40,
        dailyCapCzk: null,
      },
    ]);
  });

  it("parses multiple <br/>-joined clauses", () => {
    const rules = parseTariffText(
      "Po-Pá 00:00-05:59 15Kč/hod (max. 90 Kč)<br/>Ne 17:00-23:59 15Kč/hod (max. 90 Kč)",
    );
    expect(rules).toHaveLength(2);
    expect(rules![1]).toEqual({
      days: [6],
      start: "17:00",
      end: "23:59",
      pricePerHour: 15,
      dailyCapCzk: 90,
    });
  });

  it("splits an overnight window into both of its parts on the same days", () => {
    const rules = parseTariffText("Po-Pá 08:00-05:59 60Kč/hod");
    const weekdays = [0, 1, 2, 3, 4];
    expect(rules).toEqual([
      { days: weekdays, start: "00:00", end: "05:59", pricePerHour: 60, dailyCapCzk: null },
      { days: weekdays, start: "08:00", end: "23:59", pricePerHour: 60, dailyCapCzk: null },
    ]);
  });

  it("recovers price/hours and drops the cap when the suffix is truncated, warning instead of throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rules = parseTariffText("Ne 17:00-23:59 20Kč/hod (ma");
    expect(rules).toEqual([
      { days: [6], start: "17:00", end: "23:59", pricePerHour: 20, dailyCapCzk: null },
    ]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("throws on a genuinely unrecognized clause", () => {
    expect(() => parseTariffText("not a tariff clause")).toThrow(/Unrecognized tariftext clause/);
  });
});
