import type { IStorage } from '@/application/ports/IStorage';
import { InMemoryFallbackStore } from '@/infra/storage/InMemoryFallbackStore';
import { getTtlExpiresAt, isTtlEntry, unwrapWithTtl, wrapWithTtl } from '@/infra/storage/ttl';

// In-memory fallback used when neither chrome.storage.local nor window.localStorage
// are available (e.g. tests or non-extension environments).
const inMemoryLocalStore = new InMemoryFallbackStore<string, unknown>({
  // Keep bounded even in long-running contexts; this is a fallback only.
  maxEntries: 500,
  sweepIntervalMs: 60_000,
  isStale: (raw, now) => {
    if (isTtlEntry(raw)) return now >= getTtlExpiresAt(raw);
    return false;
  },
});

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

    const raw = inMemoryLocalStore.get(key);
    if (raw !== undefined) {
      return unwrapWithTtl<T>(key, raw, (k) => inMemoryLocalStore.delete(k));
    }

    return null;
  }

  async save(key: string, value: unknown, ttlMs?: number): Promise<void> {
    const chromeLocal = getChromeLocalArea();
    const payload = wrapWithTtl(value, ttlMs);

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
}
