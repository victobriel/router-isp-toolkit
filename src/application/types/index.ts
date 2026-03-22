import type { ExtractionResult, PingTestResult } from '@/domain/schemas/validation';
import {
  routerStateShape,
  wlanSsidPreferenceEntrySchema,
} from '@/domain/schemas/router-state-schema';
import { z } from 'zod';

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

const regExpSchema = z.union([z.string(), z.instanceof(RegExp)]).transform((value, ctx) => {
  if (value instanceof RegExp) return value;

  try {
    return new RegExp(value);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid regex',
    });
    return z.NEVER;
  }
});

const ssidPreferenceEntry = wlanSsidPreferenceEntrySchema(regExpSchema);
const ssidPreferenceEntryStrings = wlanSsidPreferenceEntrySchema(z.string());

/** Persisted in extension storage (JSON); pattern fields are plain strings. */
const preferencesStorageFields = routerStateShape({
  pppoeUsername: z.string(),
  ipVersion: z.string(),
  ipOrPattern: z.string(),
  tr069Url: z.string(),
  wlan24GhzSsids: ssidPreferenceEntryStrings,
  wlan5GhzSsids: ssidPreferenceEntryStrings,
});

export const RouterPreferencesSchema = z.object(preferencesStorageFields).partial();

export type RouterPreferencesStore = z.infer<typeof RouterPreferencesSchema>;

export const RouterPreferencesByModelSchema = z.record(z.string(), RouterPreferencesSchema);

export type RouterPreferencesByModel = z.infer<typeof RouterPreferencesByModelSchema>;

/** Same shape as stored prefs, with regex parsing for matching against extraction. */
const preferencesMatchFields = routerStateShape({
  pppoeUsername: regExpSchema,
  ipVersion: regExpSchema,
  ipOrPattern: regExpSchema,
  tr069Url: regExpSchema,
  wlan24GhzSsids: ssidPreferenceEntry,
  wlan5GhzSsids: ssidPreferenceEntry,
});

export const RouterPreferencesMatchSchema = z.object(preferencesMatchFields).partial();
export type RouterPreferencesMatch = z.infer<typeof RouterPreferencesMatchSchema>;
