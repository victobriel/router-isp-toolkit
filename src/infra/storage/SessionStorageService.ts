import type { IStorage } from '@/application/ports/IStorage';
import { InMemoryFallbackStore } from '@/infra/storage/InMemoryFallbackStore';
import { getTtlExpiresAt, isTtlEntry, unwrapWithTtl, wrapWithTtl } from '@/infra/storage/ttl';

// In-memory fallback when `chrome.storage.session` is unavailable (tests, non-extension env).
const inMemorySessionStore = new InMemoryFallbackStore<string, unknown>({
  maxEntries: 500,
  sweepIntervalMs: 60_000,
  isStale: (raw, now) => {
    if (isTtlEntry(raw)) return now >= getTtlExpiresAt(raw);
    return false;
  },
});

function getChromeSessionArea(): chrome.storage.SessionStorageArea | null {
  try {
    if (typeof chrome === 'undefined') return null;
    if (!chrome.storage?.session) return null;
    return chrome.storage.session;
  } catch {
    return null;
  }
}

/**
 * Session-scoped data: `chrome.storage.session` only (cleared on extension unload / browser restart).
 * Does not use `window.sessionStorage` (host page) or `chrome.storage.local`.
 * Call `chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })`
 * from the service worker so content scripts can read/write the same session area.
 */
export class SessionStorageService implements IStorage {
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
        const fromSession = unwrapWithTtl<T>(key, raw, async (k) => {
          try {
            await chromeSession.remove(k);
          } catch {
            // ignore
          }
        });
        if (fromSession !== null) return fromSession;
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
    const payload = wrapWithTtl(value, ttlMs);
    const chromeSession = getChromeSessionArea();

    if (chromeSession) {
      try {
        await chromeSession.set({ [key]: payload });
        return;
      } catch {
        // fall through to in-memory
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
        // ignore
      }
    }

    inMemorySessionStore.delete(key);
  }
}
