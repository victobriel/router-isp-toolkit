import type { IStorage } from '../../application/ports/IStorage';

const TTL_PREFIX = '__ttl:';
const VALUE_KEY = '__v';

// In-memory fallback used when neither chrome.storage.local nor window.localStorage
// are available (e.g. tests or non-extension environments).
const inMemoryLocalStore = new Map<string, unknown>();

function isTtlEntry(raw: unknown): raw is { [VALUE_KEY]: unknown; [key: string]: unknown } {
  return (
    typeof raw === 'object' && raw !== null && VALUE_KEY in raw && TTL_PREFIX + 'expiresAt' in raw
  );
}

function unwrapWithTtl<T>(
  key: string,
  raw: unknown,
  remove: (key: string) => Promise<void> | void,
): T | null {
  if (raw === undefined || raw === null) return null;

  if (isTtlEntry(raw)) {
    const expiresAt = raw[TTL_PREFIX + 'expiresAt'] as number;
    if (Date.now() >= expiresAt) {
      void remove(key);
      return null;
    }
    return raw[VALUE_KEY] as T;
  }

  return raw as T;
}

function getChromeLocalArea(): chrome.storage.StorageArea | null | undefined {
  try {
    if (typeof chrome === 'undefined') return null;
    if (!chrome.storage || !chrome.storage.local) return null;
    return chrome.storage.local;
  } catch {
    return null;
  }
}

function getWindowLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    if (!('localStorage' in window)) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Storage adapter backed primarily by chrome.storage.local, with graceful fallbacks. */
export class StorageService implements IStorage {
  async get<T>(key: string): Promise<T | null> {
    const chromeLocal = getChromeLocalArea();
    if (chromeLocal) {
      const result = await chromeLocal.get(key);
      const raw = result[key];
      return unwrapWithTtl<T>(key, raw, async (k) => {
        try {
          await chromeLocal.remove(k);
        } catch {
          // ignore removal errors
        }
      });
    }

    const windowLocal = getWindowLocalStorage();
    if (windowLocal) {
      try {
        const rawStr = windowLocal.getItem(key);
        if (rawStr === null) return null;

        let parsed: unknown;
        try {
          parsed = JSON.parse(rawStr);
        } catch {
          parsed = rawStr;
        }

        return unwrapWithTtl<T>(key, parsed, (k) => {
          try {
            windowLocal.removeItem(k);
          } catch {
            // ignore
          }
        });
      } catch {
        // fall through to in-memory
      }
    }

    if (inMemoryLocalStore.has(key)) {
      return unwrapWithTtl<T>(key, inMemoryLocalStore.get(key), (k) => {
        inMemoryLocalStore.delete(k);
      });
    }

    return null;
  }

  async save(key: string, value: unknown, ttlMs?: number): Promise<void> {
    const chromeLocal = getChromeLocalArea();
    const now = Date.now();
    const payload =
      ttlMs != null && ttlMs > 0
        ? {
            [VALUE_KEY]: value,
            [TTL_PREFIX + 'expiresAt']: now + ttlMs,
          }
        : value;

    if (chromeLocal) {
      try {
        await chromeLocal.set({ [key]: payload });
        return;
      } catch {
        // fall through to other backends
      }
    }

    const windowLocal = getWindowLocalStorage();
    if (windowLocal) {
      try {
        const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
        windowLocal.setItem(key, serialized);
        return;
      } catch {
        // fall through to in-memory
      }
    }

    inMemoryLocalStore.set(key, payload);
  }

  async remove(key: string): Promise<void> {
    const chromeLocal = getChromeLocalArea();
    if (chromeLocal) {
      try {
        await chromeLocal.remove(key);
      } catch {
        // ignore and continue to other backends
      }
    }

    const windowLocal = getWindowLocalStorage();
    if (windowLocal) {
      try {
        windowLocal.removeItem(key);
      } catch {
        // ignore
      }
    }

    inMemoryLocalStore.delete(key);
  }

  /** Clears all local storage (best-effort across backends; not on IStorage). */
  async clear(): Promise<void> {
    const chromeLocal = getChromeLocalArea();
    if (chromeLocal) {
      try {
        await chromeLocal.clear();
      } catch {
        // ignore and try other backends
      }
    }

    const windowLocal = getWindowLocalStorage();
    if (windowLocal) {
      try {
        windowLocal.clear();
      } catch {
        // ignore
      }
    }

    inMemoryLocalStore.clear();
  }

  /** Static API for backward compatibility; delegates to default instance. */
  static get<T>(key: string): Promise<T | null> {
    return storageInstance.get<T>(key);
  }
  static save(key: string, value: unknown, ttlMs?: number): Promise<void> {
    return storageInstance.save(key, value, ttlMs);
  }
  static remove(key: string): Promise<void> {
    return storageInstance.remove(key);
  }
  static clear(): Promise<void> {
    return storageInstance.clear();
  }
}

const storageInstance = new StorageService();

/** Default storage instance (composition root can replace for tests). */
export const defaultStorage: IStorage = storageInstance;
