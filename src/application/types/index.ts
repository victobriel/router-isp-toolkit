import type { ExtractionResult } from "../../domain/schemas/validation.js";

/** Application-level response for collect/authenticate operations. */
export interface CollectResponse {
  success: boolean;
  message?: string;
  data?: ExtractionResult;
}

/** Status type for popup UI feedback. */
export enum PopupStatusType {
  NONE = "none",
  OK = "ok",
  WARN = "warn",
  ERROR = "err",
}

export type CredentialBookmark = { username: string; password: string };
export type ModelBookmarks = {
  model: string;
  credentials: CredentialBookmark[];
};
export type BookmarkStore = Record<string, ModelBookmarks>;
