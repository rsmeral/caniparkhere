import { describe, expect, it } from "vitest";
import { formatPinHash, parsePinHash } from "./pinState";

describe("pin hash", () => {
  it("round-trips a pin", () => {
    const pin = { lon: 14.4378, lat: 50.0755, accuracyMeters: 20 };
    expect(parsePinHash(formatPinHash(pin))).toEqual(pin);
  });

  it("rejects anything that isn't three numbers", () => {
    expect(parsePinHash("")).toBeNull();
    expect(parsePinHash("#50.07,14.43")).toBeNull();
    expect(parsePinHash("#50.07,abc,20")).toBeNull();
  });
});
