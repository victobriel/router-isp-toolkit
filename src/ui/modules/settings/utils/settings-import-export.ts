import type { BookmarkStore, CredentialBookmark } from '@/application/types';

export type SettingsConfigSectionKey = 'bookmarks' | 'copyTextTemplate' | 'routerPreferences';

export function normalizeImportBookmarkStore(raw: unknown): BookmarkStore | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const next: BookmarkStore = {};
  for (const [modelKey, v] of Object.entries(obj)) {
    if (v == null || typeof v !== 'object' || Array.isArray(v)) return null;

    const candidate = v as Record<string, unknown>;
    if (typeof candidate.model !== 'string') return null;

    const credsRaw = candidate.credentials;
    if (!Array.isArray(credsRaw)) return null;

    const credentials: CredentialBookmark[] = [];
    for (const c of credsRaw) {
      if (c == null || typeof c !== 'object' || Array.isArray(c)) return null;
      const cc = c as Record<string, unknown>;
      if (typeof cc.id !== 'string') return null;
      if (typeof cc.username !== 'string') return null;
      if (typeof cc.password !== 'string') return null;
      credentials.push({ id: cc.id, username: cc.username, password: cc.password });
    }

    next[modelKey] = { model: candidate.model, credentials };
  }

  return next;
}

export function downloadJsonFile(filename: string, value: unknown) {
  const json = JSON.stringify(value, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
