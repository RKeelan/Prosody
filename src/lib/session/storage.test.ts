import { afterEach, describe, expect, test } from "bun:test";
import { browserStorage, createMemoryStorage, storageAdapter } from "./storage";

/** A minimal Web Storage double, so the adapter can be tested without a browser. */
function fakeWebStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, v);
    },
  } as Storage;
}

const globals = globalThis as { localStorage?: Storage };
const originalLocalStorage = globals.localStorage;

afterEach(() => {
  globals.localStorage = originalLocalStorage;
});

describe("createMemoryStorage", () => {
  test("stores, reads, removes, and enumerates", () => {
    const storage = createMemoryStorage();
    expect(storage.getItem("a")).toBeNull();
    storage.setItem("a", "1");
    storage.setItem("b", "2");
    expect(storage.getItem("a")).toBe("1");
    expect(storage.keys().sort()).toEqual(["a", "b"]);
    storage.removeItem("a");
    expect(storage.getItem("a")).toBeNull();
    expect(storage.keys()).toEqual(["b"]);
  });

  test("seeds from an initial record", () => {
    const storage = createMemoryStorage({ seed: "value" });
    expect(storage.getItem("seed")).toBe("value");
  });

  test("keeps an empty string distinct from an absent key", () => {
    const storage = createMemoryStorage();
    storage.setItem("empty", "");
    expect(storage.getItem("empty")).toBe("");
    expect(storage.getItem("missing")).toBeNull();
  });
});

describe("storageAdapter", () => {
  test("wraps a Web Storage object and enumerates its keys", () => {
    const backing = fakeWebStorage();
    const storage = storageAdapter(backing);
    storage.setItem("x", "10");
    storage.setItem("y", "20");
    expect(backing.getItem("x")).toBe("10");
    expect(storage.getItem("y")).toBe("20");
    expect(storage.keys().sort()).toEqual(["x", "y"]);
    storage.removeItem("x");
    expect(storage.keys()).toEqual(["y"]);
  });
});

describe("browserStorage", () => {
  test("returns null when no localStorage exists", () => {
    globals.localStorage = undefined;
    expect(browserStorage()).toBeNull();
  });

  test("returns an adapter when localStorage works", () => {
    globals.localStorage = fakeWebStorage();
    const storage = browserStorage();
    expect(storage).not.toBeNull();
    storage?.setItem("k", "v");
    expect(globals.localStorage?.getItem("k")).toBe("v");
    // The probe key must not linger.
    expect(storage?.keys()).toEqual(["k"]);
  });

  test("returns null when localStorage throws on use (private mode)", () => {
    globals.localStorage = {
      setItem() {
        throw new Error("access denied");
      },
    } as unknown as Storage;
    expect(browserStorage()).toBeNull();
  });
});
