import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPermits, savePermits } from "./permits";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

describe("permits", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("has none until some are saved, then remembers them", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(loadPermits()).toEqual([]);
    savePermits(["5", "8.1"]);
    expect(loadPermits()).toEqual(["5", "8.1"]);
  });

  it("has none when what's stored isn't a list of areas", () => {
    const storage = memoryStorage();
    storage.setItem("caniparkhere.permits", "{not json");
    vi.stubGlobal("localStorage", storage);
    expect(loadPermits()).toEqual([]);
    storage.setItem("caniparkhere.permits", JSON.stringify({ area: "5" }));
    expect(loadPermits()).toEqual([]);
  });

  it("has none when storage is blocked, and saving doesn't throw", () => {
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked });
    expect(() => savePermits(["5"])).not.toThrow();
    expect(loadPermits()).toEqual([]);
  });
});
