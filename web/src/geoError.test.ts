import { describe, expect, it } from "vitest";
import { classifyGeoError } from "./geoError";

// W3C GeolocationPositionError codes.
const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

describe("classifyGeoError", () => {
  it("treats PERMISSION_DENIED as terminal regardless of whether we have a fix", () => {
    expect(classifyGeoError(PERMISSION_DENIED, false)).toBe("denied");
    expect(classifyGeoError(PERMISSION_DENIED, true)).toBe("denied");
  });

  it("keeps an existing position through a transient error", () => {
    // This is the iOS "kCLErrorDomain error 0" case - a blip shouldn't blank out a good answer.
    expect(classifyGeoError(POSITION_UNAVAILABLE, true)).toBe("keep");
    expect(classifyGeoError(TIMEOUT, true)).toBe("keep");
  });

  it("waits rather than erroring when a transient error arrives before any fix", () => {
    expect(classifyGeoError(POSITION_UNAVAILABLE, false)).toBe("wait");
    expect(classifyGeoError(TIMEOUT, false)).toBe("wait");
  });

  it("treats an unrecognized code as transient rather than terminal", () => {
    expect(classifyGeoError(99, false)).toBe("wait");
    expect(classifyGeoError(99, true)).toBe("keep");
  });
});
