import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadMapConsent, loadMapOpened, saveMapConsent, saveMapOpened } from "./mapConsent";

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

  it("is not given until saved, then remembered", () => {
    expect(loadMapConsent()).toBe(false);
    saveMapConsent();
    expect(loadMapConsent()).toBe(true);
  });

  it("remembers the map was opened, apart from the consent", () => {
    expect(loadMapOpened()).toBe(false);
    saveMapOpened();
    expect(loadMapOpened()).toBe(true);
    expect(loadMapConsent()).toBe(false);
  });

  it("counts blocked storage as not given", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => saveMapConsent()).not.toThrow();
    expect(loadMapConsent()).toBe(false);
  });
});
