export const REGEX_META = /[.*+?^${}()|[\]\\]/g;

/** `value="…"` on a single HTML tag fragment (Huawei pages use double or single quotes). */
export const INPUT_VALUE_ATTR = /value=["']([^"']*)["']/i;

/**
 * Single- or double-quoted JS string literal, supporting `\x..` and other backslash
 * escapes. Group 1 captures the content of `"…"`; group 2 captures the content of `'…'`.
 */
export const JS_STRING_LITERAL = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;

/**
 * Huawei AMP / `stWlan` / `stWlanWifi` value codes → display labels.
 * Shared by multiple Huawei ONT drivers (same web UI conventions).
 */

/** Huawei `stWlanWifi` channel width / `X_HW_HT20` codes → display label */
export const HUAWEI_WLAN_BANDWIDTH_LABELS: Partial<Record<string, string>> = {
  '0': 'Auto',
  '1': '20MHz',
  '2': '40MHz',
  '3': 'Auto',
};

/** Huawei `mode` / `X_HW_Standard` codes → display label */
export const HUAWEI_WLAN_MODE_LABELS: Partial<Record<string, string>> = {
  '11b': '802.11b',
  '11g': '802.11g',
  '11bg': '802.11b/g',
  '11bgn': '802.11b/g/n',
  '11a': '802.11a',
  '11na': '802.11a/n',
  '11ac': '802.11a/n/ac',
  '11ax': '802.11b/g/n/ax',
};

export const HUAWEI_WLAN_AUTHENTICATION_MODE_LABELS: Partial<Record<string, string>> = {
  Basic: 'Open',
  WPA: 'WPA',
  '11i': 'WPA2',
  WPAand11i: 'WPA/WPA2',
  WPA3: 'WPA3',
  'WPA2/WPA3': 'WPA2/WPA3',
};

export const HUAWEI_WLAN_ENCRYPTION_MODE_LABELS: Partial<Record<string, string>> = {
  AESEncryption: 'AES',
  TKIPEncryption: 'TKIP',
  TKIPandAESEncryption: 'TKIP&AES',
  PSKAuthentication: 'PSK',
  PSKandSAEAuthentication: 'PSK&SAE',
};
