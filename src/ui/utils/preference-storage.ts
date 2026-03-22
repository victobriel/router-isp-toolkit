import type { RouterPreferencesByModel } from '@/application/types';

function isPartitionedByRouterModel(obj: Record<string, unknown>): boolean {
  const keys = Object.keys(obj);
  if (keys.length === 0) return true;
  return keys.every((k) => {
    const v = obj[k];
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  });
}

/** Ensures stored value is `Record<modelKey, prefs>`; otherwise returns empty. */
export function normalizeRouterPreferencesStorage(raw: unknown): RouterPreferencesByModel {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const obj = raw as Record<string, unknown>;
  if (isPartitionedByRouterModel(obj)) {
    return obj as RouterPreferencesByModel;
  }
  return {};
}
