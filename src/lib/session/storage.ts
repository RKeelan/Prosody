/**
 * A minimal key/value storage abstraction for session persistence.
 *
 * The persistence layer never touches `window.localStorage` directly. It talks to
 * a {@link SessionStorage}—get/set/remove plus key enumeration—so the same code
 * runs against real localStorage in the browser, an in-memory fake under
 * `bun test`, or nothing at all off-browser. Enumeration is first-class because
 * the app must list every saved session for a pack id (to detect "same pack,
 * edited text") and re-key one when the pack's content hash changes.
 *
 * $Claude The interface is deliberately synchronous and string-only, matching Web
 * Storage. Progress is a few kilobytes of JSON and localStorage is synchronous, so
 * an async interface would add ceremony for no gain. A later move to IndexedDB, if
 * progress ever outgrew localStorage, would wrap this shape behind an async
 * variant then, not pre-emptively now.
 */

export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Every key currently held, in unspecified order. */
  keys(): string[];
}

/** An in-memory {@link SessionStorage}, for tests and any non-persistent use. */
export function createMemoryStorage(initial?: Record<string, string>): SessionStorage {
  const map = new Map<string, string>(initial ? Object.entries(initial) : []);
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    keys: () => [...map.keys()],
  };
}

/**
 * Wrap any Web Storage-shaped object (localStorage, sessionStorage, or a test
 * double) as a {@link SessionStorage}. Pure: it reads and writes only the object
 * passed in, touching no globals.
 */
export function storageAdapter(backing: Storage): SessionStorage {
  return {
    getItem: (key) => backing.getItem(key),
    setItem: (key, value) => {
      backing.setItem(key, value);
    },
    removeItem: (key) => {
      backing.removeItem(key);
    },
    keys: () => {
      const out: string[] = [];
      for (let i = 0; i < backing.length; i++) {
        const key = backing.key(i);
        if (key !== null) out.push(key);
      }
      return out;
    },
  };
}

/**
 * `window.localStorage` as a {@link SessionStorage}, or `null` when it is
 * unavailable—server-side, under `bun test`, or a privacy mode that throws on
 * access. Importing this module never touches globals; the guard runs only here,
 * when called, so nothing breaks off-browser. A write/read probe rules out the
 * case of a present-but-throwing localStorage.
 */
export function browserStorage(): SessionStorage | null {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (!ls) return null;
    const probe = "__prosody_probe__";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return storageAdapter(ls);
  } catch {
    return null;
  }
}
