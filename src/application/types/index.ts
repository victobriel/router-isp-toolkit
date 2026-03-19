import type { ExtractionResult, PingTestResult } from '@/domain/schemas/validation';

/** Application-level response for collect/authenticate operations. */
export interface CollectResponse {
  success: boolean;
  message?: string;
  data?: ExtractionResult;
  pingResult?: PingTestResult;
}

/** Status type for popup UI feedback. */
export enum PopupStatusType {
  NONE = 'none',
  OK = 'ok',
  WARN = 'warn',
  ERR = 'err',
}

export type PopupStatus = {
  type: PopupStatusType;
  message: string;
};

export type CredentialBookmark = { id: string; username: string; password: string };
export type ModelBookmarks = {
  model: string;
  credentials: CredentialBookmark[];
};
export type BookmarkStore = Record<string, ModelBookmarks>;
