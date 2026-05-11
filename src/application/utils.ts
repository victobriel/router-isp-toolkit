import { LAST_AUTH_CREDENTIALS_STORAGE_KEY } from '@/application/constants';

export function lastAuthCredentialsStorageKey(tabId: number): string {
  return `${LAST_AUTH_CREDENTIALS_STORAGE_KEY}:${String(tabId)}`;
}
