import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadMapConsent, saveMapConsent } from "./mapConsent";

describe("map consent", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is unanswered until saved, then remembers the answer", () => {
    expect(loadMapConsent()).toBeNull();
    saveMapConsent("accepted");
    expect(loadMapConsent()).toBe("accepted");
    saveMapConsent("declined");
    expect(loadMapConsent()).toBe("declined");
  });

  it("counts blocked storage as unanswered", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => saveMapConsent("accepted")).not.toThrow();
    expect(loadMapConsent()).toBeNull();
  });
});
