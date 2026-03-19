import type { IStorage } from '../../application/ports/IStorage';
import { InMemoryFallbackStore } from './InMemoryFallbackStore';

const TTL_PREFIX = '__ttl:';
const VALUE_KEY = '__v';

// In-memory fallback used when neither chrome.storage.session nor window.sessionStorage
// are available (e.g. tests or non-extension environments).
const inMemorySessionStore = new InMemoryFallbackStore<string, unknown>({
  // Keep bounded even in long-running contexts; this is a fallback only.
  maxEntries: 500,
  sweepIntervalMs: 60_000,
  isStale: (raw, now) => {
    if (
      typeof raw === 'object' &&
      raw !== null &&
      VALUE_KEY in raw &&
      TTL_PREFIX + 'expiresAt' in raw
    ) {
      const expiresAt = (raw as Record<string, unknown>)[TTL_PREFIX + 'expiresAt'] as number;
      return now >= expiresAt;
    }
    return false;
  },
});

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

function getChromeSessionArea(): chrome.storage.StorageArea | null | undefined {
  try {
    if (typeof chrome === 'undefined') return null;
    if (!chrome.storage || !chrome.storage.session) return null;
    return chrome.storage.session;
  } catch {
    return null;
  }
}

function getWindowSessionStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    if (!('sessionStorage' in window)) return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Storage adapter backed primarily by `chrome.storage.session` for per-session data,
 * with fallbacks to `window.sessionStorage` and in-memory storage.
 */
export class SessionStorageService implements IStorage {
  /**
   * Static convenience for legacy call sites.
   *
   * Note: This is async because `chrome.storage.session` is async.
   * It follows the same backend precedence as the instance `get()`.
   */
  static async getItem<T>(key: string): Promise<T | null> {
    return await new SessionStorageService().get<T>(key);
  }

  /** IStorage implementation: get value (handles optional TTL wrapper). */
  async get<T>(key: string): Promise<T | null> {
    const chromeSession = getChromeSessionArea();
    if (chromeSession) {
      try {
        const result = await chromeSession.get(key);
        const raw = result[key];
        return unwrapWithTtl<T>(key, raw, async (k) => {
          try {
            await chromeSession.remove(k);
          } catch {
            // ignore
          }
        });
      } catch {
        // fall through to other backends
      }
    }

    const storage = getWindowSessionStorage();
    if (storage) {
      try {
        const rawStr = storage.getItem(key);
        if (rawStr === null) return null;

        let parsed: unknown;
        try {
          parsed = JSON.parse(rawStr);
        } catch {
          // Fallback for plain string values stored outside of IStorage.save
          parsed = rawStr;
        }

        return unwrapWithTtl<T>(key, parsed, (k) => {
          try {
            storage.removeItem(k);
          } catch {
            // ignore
          }
        });
      } catch {
        // fall through to in-memory
      }
    }

    const raw = inMemorySessionStore.get(key);
    if (raw !== undefined) {
      return unwrapWithTtl<T>(key, raw, (k) => inMemorySessionStore.delete(k));
    }

    return null;
  }

  /** IStorage implementation: save value with optional TTL. */
  async save(key: string, value: unknown, ttlMs?: number): Promise<void> {
    const chromeSession = getChromeSessionArea();
    const now = Date.now();
    const payload =
      ttlMs != null && ttlMs > 0
        ? {
            [VALUE_KEY]: value,
            [TTL_PREFIX + 'expiresAt']: now + ttlMs,
          }
        : value;

    if (chromeSession) {
      try {
        await chromeSession.set({ [key]: payload });
        return;
      } catch {
        // fall through to other backends
      }
    }

    const storage = getWindowSessionStorage();
    if (storage) {
      try {
        const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
        storage.setItem(key, serialized);
        return;
      } catch {
        // Swallow storage errors (quota, privacy mode, serialization).
      }
    }

    inMemorySessionStore.set(key, payload);
  }

  /** IStorage implementation: remove key. */
  async remove(key: string): Promise<void> {
    const chromeSession = getChromeSessionArea();
    if (chromeSession) {
      try {
        await chromeSession.remove(key);
      } catch {
        // ignore and continue to other backends
      }
    }

    const storage = getWindowSessionStorage();
    if (storage) {
      try {
        storage.removeItem(key);
      } catch {
        // Ignore removal errors.
      }
    }

    inMemorySessionStore.delete(key);
  }
}

const sessionStorageInstance = new SessionStorageService();

/** Default session storage instance (composition root can replace for tests). */
export const defaultSessionStorageService: IStorage = sessionStorageInstance;
