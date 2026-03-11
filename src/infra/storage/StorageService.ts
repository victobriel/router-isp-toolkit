import type { IStorage } from "../../application/ports/IStorage.js";

const TTL_PREFIX = "__ttl:";
const VALUE_KEY = "__v";

function isTtlEntry(
  raw: unknown
): raw is { [VALUE_KEY]: unknown; [key: string]: unknown } {
  return (
    typeof raw === "object" &&
    raw !== null &&
    VALUE_KEY in raw &&
    TTL_PREFIX + "expiresAt" in raw
  );
}

/** Chrome extension storage adapter. Implements IStorage; static API delegates to default instance. */
export class StorageService implements IStorage {
  async get<T>(key: string): Promise<T | null> {
    const result = await chrome.storage.local.get(key);
    const raw = result[key];
    if (raw === undefined) return null;

    if (isTtlEntry(raw)) {
      const expiresAt = raw[TTL_PREFIX + "expiresAt"] as number;
      if (Date.now() >= expiresAt) {
        await chrome.storage.local.remove(key);
        return null;
      }
      return raw[VALUE_KEY] as T;
    }

    return raw as T;
  }

  async save(key: string, value: unknown, ttlMs?: number): Promise<void> {
    if (ttlMs == null || ttlMs <= 0) {
      await chrome.storage.local.set({ [key]: value });
      return;
    }
    const expiresAt = Date.now() + ttlMs;
    await chrome.storage.local.set({
      [key]: { [VALUE_KEY]: value, [TTL_PREFIX + "expiresAt"]: expiresAt },
    });
  }

  async remove(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  }

  /** Clears all local storage (Chrome-specific; not on IStorage). */
  async clear(): Promise<void> {
    await chrome.storage.local.clear();
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
