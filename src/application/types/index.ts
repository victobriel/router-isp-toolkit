import type {
  ExtractionResult,
  GoToPageOptionSchema,
  PingTestResult,
} from '@/domain/schemas/validation';
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
  authenticated?: boolean;
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

export enum RouterPage {
  WAN = 'wan',
  REMOTE_ACCESS = 'remote_access',
  WLAN = 'wlan',
  DHCP = 'dhcp',
  MANAGEMENT = 'management',
  TR_069 = 'tr_069',
  UPnP = 'upnp',
  BAND_STEERING = 'band_steering',
}

export enum RouterPageKey {
  // WAN
  PPPOE_USERNAME = 'pppoe_username',
  INTERNET_STATUS = 'internet_status',
  TR_069_STATUS = 'tr_069_status',
  LINK_SPEED = 'link_speed',
  IP_VERSION = 'ip_version',
  REQUEST_PD_STATUS = 'request_pd_status',
  SLAAC_STATUS = 'slaac_status',
  DHCPV6_STATUS = 'dhcpv6_status',
  PD_STATUS = 'pd_status',

  // DHCP
  DHCP_STATUS = 'dhcp_status',
  DHCP_IP_ADDRESS = 'dhcp_ip_address',
  DHCP_SUBNET_MASK = 'dhcp_subnet_mask',
  DHCP_START_IP = 'dhcp_start_ip',
  DHCP_END_IP = 'dhcp_end_ip',
  DHCP_ISP_DNS_STATUS = 'dhcp_isp_dns_status',
  DHCP_PRIMARY_DNS = 'dhcp_primary_dns',
  DHCP_SECONDARY_DNS = 'dhcp_secondary_dns',
  DHCP_LEASE_TIME_MODE = 'dhcp_lease_time_mode',
  DHCP_LEASE_TIME = 'dhcp_lease_time',

  // REMOTE ACCESS
  REMOTE_ACCESS_IPV4_STATUS = 'remote_access_ipv4_status',
  REMOTE_ACCESS_IPV6_STATUS = 'remote_access_ipv6_status',

  // MISC
  UPDATE = 'update',
  TR_069_URL = 'tr_069_url',
  UPNP_STATUS = 'upnp_status',
  BAND_STEERING_STATUS = 'band_steering_status',

  // WLAN
  WLAN_STATUS = 'wlan_status',
  WLAN_CHANNEL = 'wlan_channel',
  WLAN_MODE = 'wlan_mode',
  WLAN_BANDWIDTH = 'wlan_bandwidth',
  WLAN_TRANSMITTING_POWER = 'wlan_transmitting_power',

  // WLAN SSID
  WLAN_SSID_STATUS = 'ssid_status',
  WLAN_SSID_NAME = 'ssid_name',
  WLAN_SSID_PASSWORD = 'ssid_password',
  WLAN_SSID_HIDE_MODE_STATUS = 'ssid_hide_mode_status',
  WLAN_WPA2_SECURITY_TYPE = 'wpa2_security_type',
  WLAN_MAX_CLIENTS = 'max_clients',
}

export type GoToPageOptions = z.infer<typeof GoToPageOptionSchema>;

export type RouterSelectors = Record<string, string>;

export const EXTRACTION_FILTER_KEYS = [
  'topology',
  'wan',
  'remoteAccess',
  'wlan',
  'lan',
  'upnp',
  'tr069',
  'routerInfo',
] as const;

export type ExtractionFilterKey = (typeof EXTRACTION_FILTER_KEYS)[number];
export type ExtractionFilter = ExtractionFilterKey[];

export function normalizeExtractionFilter(raw: unknown): ExtractionFilter {
  if (!Array.isArray(raw)) {
    return [...EXTRACTION_FILTER_KEYS];
  }

  const normalized = Array.from(
    new Set(
      raw.filter(
        (value): value is ExtractionFilterKey =>
          typeof value === 'string' &&
          EXTRACTION_FILTER_KEYS.includes(value as ExtractionFilterKey),
      ),
    ),
  );

  return normalized.length ? normalized : [...EXTRACTION_FILTER_KEYS];
}
