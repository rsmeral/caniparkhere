import { describe, expect, it } from "vitest";
import { swipeDirection } from "./swipe";

describe("swipeDirection", () => {
  it("tells a long vertical swipe's direction", () => {
    expect(swipeDirection({ x: 100, y: 700 }, { x: 110, y: 400 }, 800)).toBe("up");
    expect(swipeDirection({ x: 100, y: 200 }, { x: 90, y: 500 }, 800)).toBe("down");
  });

  it("ignores a short one, measured against the screen's height", () => {
    expect(swipeDirection({ x: 100, y: 700 }, { x: 100, y: 560 }, 800)).toBeNull();
    expect(swipeDirection({ x: 100, y: 700 }, { x: 100, y: 560 }, 600)).toBe("up");
  });

  it("ignores one that's more sideways than up or down", () => {
    expect(swipeDirection({ x: 50, y: 700 }, { x: 300, y: 400 }, 800)).toBeNull();
  });
});
