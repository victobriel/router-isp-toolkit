/**
 * Port for key-value storage (e.g. Chrome extension storage).
 * Application and presentation depend on this; infra provides the implementation (DIP).
 */
export interface IStorage {
  get<T>(key: string): Promise<T | null>;
  save(key: string, value: unknown, ttlMs?: number): Promise<void>;
  remove(key: string): Promise<void>;
  clear?: () => Promise<void>;
}
