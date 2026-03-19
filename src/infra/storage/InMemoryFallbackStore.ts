export type InMemoryFallbackStoreOptions<TValue> = {
  /**
   * Maximum number of entries to keep. When exceeded, least-recently-used-ish
   * entries are evicted (based on `lastAccessAt`).
   */
  maxEntries: number;
  /** Minimum time between full sweeps. */
  sweepIntervalMs: number;
  /** Predicate used to remove stale entries (e.g., TTL expiry). */
  isStale: (value: TValue, now: number) => boolean;
};

type Entry<TValue> = {
  value: TValue;
  lastAccessAt: number;
};

export class InMemoryFallbackStore<TKey, TValue> {
  private readonly map = new Map<TKey, Entry<TValue>>();
  private lastSweepAt = 0;

  constructor(private readonly options: InMemoryFallbackStoreOptions<TValue>) {}

  has(key: TKey): boolean {
    return this.map.has(key);
  }

  get(key: TKey): TValue | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    const now = Date.now();
    entry.lastAccessAt = now;
    this.sweepIfNeeded(now);
    return entry.value;
  }

  set(key: TKey, value: TValue): void {
    const now = Date.now();
    this.map.set(key, { value, lastAccessAt: now });
    this.sweepIfNeeded(now);
    this.enforceMaxEntries();
  }

  delete(key: TKey): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
    this.lastSweepAt = 0;
  }

  private sweepIfNeeded(now: number): void {
    if (now - this.lastSweepAt < this.options.sweepIntervalMs) return;
    this.lastSweepAt = now;

    for (const [key, entry] of this.map.entries()) {
      if (this.options.isStale(entry.value, now)) {
        this.map.delete(key);
      }
    }
  }

  private enforceMaxEntries(): void {
    const max = this.options.maxEntries;
    if (max <= 0) return;

    while (this.map.size > max) {
      let oldestKey: TKey | undefined = undefined;
      let oldestAccessAt = Infinity;

      for (const [key, entry] of this.map.entries()) {
        if (entry.lastAccessAt < oldestAccessAt) {
          oldestAccessAt = entry.lastAccessAt;
          oldestKey = key;
        }
      }

      if (oldestKey === undefined) return;
      this.map.delete(oldestKey);
    }
  }
}

