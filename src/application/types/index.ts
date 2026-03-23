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

const wlanPreferencesStorageConfigSchema = z.object({
  enabled: z.boolean(),
  channel: z.array(z.string()),
  mode: z.string(),
  bandWidth: z.array(z.string()),
  transmittingPower: z.string(),
});

/** Persisted in extension storage (JSON); pattern fields are plain strings. */
const preferencesStorageFields = routerStateShape({
  linkSpeed: z.string(),
  pppoeUsername: z.string(),
  ipVersion: z.string(),
  tr069Url: z.string(),
  wlan24GhzSsids: ssidPreferenceEntryStrings,
  wlan5GhzSsids: ssidPreferenceEntryStrings,
  dhcpIpAddress: z.string(),
  dhcpSubnetMask: z.string(),
  dhcpStartIp: z.string(),
  dhcpEndIp: z.string(),
  dhcpPrimaryDns: z.string(),
  dhcpSecondaryDns: z.string(),
  dhcpLeaseTimeMode: z.string(),
  wlanConfig: wlanPreferencesStorageConfigSchema.partial(),
});

export const RouterPreferencesSchema = z.object(preferencesStorageFields).partial();

export type RouterPreferencesStore = z.infer<typeof RouterPreferencesSchema>;

export const RouterPreferencesByModelSchema = z.record(z.string(), RouterPreferencesSchema);

export type RouterPreferencesByModel = z.infer<typeof RouterPreferencesByModelSchema>;

const wlanPreferencesConfigSchema = z.object({
  enabled: z.boolean(),
  channel: z.array(z.string()),
  mode: regExpSchema,
  bandWidth: z.array(z.string()),
  transmittingPower: z.string(),
});

/** Same shape as stored prefs, with regex parsing for matching against extraction. */
const preferencesMatchFields = routerStateShape({
  linkSpeed: regExpSchema,
  pppoeUsername: regExpSchema,
  ipVersion: regExpSchema,
  tr069Url: regExpSchema,
  wlan24GhzSsids: ssidPreferenceEntry,
  wlan5GhzSsids: ssidPreferenceEntry,
  dhcpIpAddress: regExpSchema,
  dhcpSubnetMask: regExpSchema,
  dhcpStartIp: regExpSchema,
  dhcpEndIp: regExpSchema,
  dhcpPrimaryDns: regExpSchema,
  dhcpSecondaryDns: regExpSchema,
  dhcpLeaseTimeMode: regExpSchema,
  wlanConfig: wlanPreferencesConfigSchema,
});

export const RouterPreferencesMatchSchema = z.object(preferencesMatchFields).partial();
export type RouterPreferencesMatch = z.infer<typeof RouterPreferencesMatchSchema>;
