const TTL_PREFIX = '__ttl:';
const VALUE_KEY = '__v';

export type TtlEntry = { [VALUE_KEY]: unknown; [key: string]: unknown };

export function isTtlEntry(raw: unknown): raw is TtlEntry {
  return (
    typeof raw === 'object' && raw !== null && VALUE_KEY in raw && TTL_PREFIX + 'expiresAt' in raw
  );
}

export function getTtlExpiresAt(raw: TtlEntry): number {
  return raw[TTL_PREFIX + 'expiresAt'] as number;
}

export function wrapWithTtl(value: unknown, ttlMs?: number, now = Date.now()): unknown {
  if (ttlMs != null && ttlMs > 0) {
    return {
      [VALUE_KEY]: value,
      [TTL_PREFIX + 'expiresAt']: now + ttlMs,
    };
  }
  return value;
}

export function unwrapWithTtl<T>(
  key: string,
  raw: unknown,
  remove: (key: string) => Promise<void> | void,
  now = Date.now(),
): T | null {
  if (raw === undefined || raw === null) return null;

  if (isTtlEntry(raw)) {
    const expiresAt = getTtlExpiresAt(raw);
    if (now >= expiresAt) {
      void remove(key);
      return null;
    }
    return raw[VALUE_KEY] as T;
  }

  return raw as T;
}
