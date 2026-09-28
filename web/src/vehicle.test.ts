import { afterEach, describe, expect, it, vi } from "vitest";
import { loadVehicle, saveVehicle } from "./vehicle";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

describe("vehicle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to an own car when nothing is stored", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(loadVehicle()).toBe("own");
  });

  it("remembers the picked vehicle", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    saveVehicle("shared");
    expect(loadVehicle()).toBe("shared");
    saveVehicle("motorbike");
    expect(loadVehicle()).toBe("motorbike");
    saveVehicle("own");
    expect(loadVehicle()).toBe("own");
  });

  it("falls back to an own car for a stored value it doesn't know", () => {
    const storage = memoryStorage();
    storage.setItem("caniparkhere.vehicle", "hovercraft");
    vi.stubGlobal("localStorage", storage);
    expect(loadVehicle()).toBe("own");
  });

  it("falls back to an own car when storage is blocked", () => {
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked });
    expect(() => saveVehicle("shared")).not.toThrow();
    expect(loadVehicle()).toBe("own");
  });
});
