export const ENDPOINT = {
  // WAN: '/html/bbsp/wan/wan.asp',
  WAN_LIST_INFO: '/html/bbsp/common/wan_list_info.asp',
  WAN_LIST: '/html/bbsp/common/wan_list.asp',
  WAN_ADDRESS_ACQUIRE: '/html/bbsp/common/wanaddressacquire.asp',
  UPNP: '/html/bbsp/upnp/upnp.asp',
  TR069: '/html/ssmp/tr069/tr069.asp',
  NEW_ACL: '/html/bbsp/portacl/newacl.asp',
  WLAN_BASIC_2G: '/html/amp/wlanbasic/WlanBasic.asp?2G',
  WLAN_BASIC_5G: '/html/amp/wlanbasic/WlanBasic.asp?5G',
  WLAN_ADVANCED_2G: '/html/amp/wlanadv/WlanAdvance.asp?2G',
  WLAN_ADVANCED_5G: '/html/amp/wlanadv/WlanAdvance.asp?5G',
  OPTICAL_INFO: '/html/amp/opticinfo/opticinfo.asp',
  /** Scripts included by `mainpage.asp`; `GetLanUserInfo` / `USERDevice` list LAN clients. */
  GET_LAN_USER_DEV_INFO: '/html/bbsp/common/GetLanUserDevInfo.asp',
  /** Some builds expose the same `USERDevice` list under a DHCP-specific script name. */
  GET_LAN_USER_DHCP_INFO: '/html/bbsp/common/GetLanUserDhcpInfo.asp',
  LAN_USER_INFO: '/html/bbsp/common/lanuserinfo.asp',
  DHCP: '/html/bbsp/dhcpservercfg/dhcp2.asp',
  LAN_ADDRESS: '/html/bbsp/lanaddress/lanaddress.asp',
  DEVICE_INFO: '/html/ssmp/deviceinfo/deviceinfo.asp',
  /**
   * Diagnostics endpoints used by `ping()`. The same `complex.cgi` action +
   * `GetPingResult.asp` poll loop is what `diagnosecommon.asp` itself uses
   * (see `OnApply()` / `GetPingResult()` in `docs/diagnosecommon-example.asp`).
   */
  DIAGNOSE_COMMON: '/html/bbsp/maintenance/diagnosecommon.asp',
  PING_DIAGNOSE:
    '/html/bbsp/maintenance/complex.cgi' +
    '?x=InternetGatewayDevice.IPPingDiagnostics' +
    '&RUNSTATE_FLAG=Ping' +
    '&RequestFile=html/bbsp/maintenance/diagnosecommon.asp',
  GET_PING_RESULT: '/html/bbsp/maintenance/GetPingResult.asp',
};

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
};

export const HUAWEI_WLAN_AUTHENTICATION_MODE_LABELS: Partial<Record<string, string>> = {
  Basic: 'Open',
  WPA: 'WPA',
  '11i': 'WPA2',
  WPAand11i: 'WPA/WPA2',
};

export const HUAWEI_WLAN_ENCRYPTION_MODE_LABELS: Partial<Record<string, string>> = {
  AESEncryption: 'AES',
  TKIPEncryption: 'TKIP',
  TKIPandAESEncryption: 'TKIP&AES',
};

/**
 * Positional layout from `function USERDevice(Domain,IpAddr,MacAddr,…)` in
 * `GetLanUserDevInfo.asp` — used when the server returns `new USERDevice(…)`
 * rows without a constructor signature (typical of POST/AJAX snippets).
 */
export const HUAWEI_USER_DEVICE_PARAM_ORDER = [
  'Domain',
  'IpAddr',
  'MacAddr',
  'Port',
  'IpType',
  'DevType',
  'DevStatus',
  'PortType',
  'Time',
  'HostName',
  'IPv4Enabled',
  'IPv6Enabled',
  'DeviceType',
  'UserDevAlias',
  'UserSpecifiedDeviceType',
  'LeaseTimeRemaining',
] as const;

/**
 * `opticinfo.asp` declares two `stOpticInfo` shapes (GPON vs RF ONT). Map the
 * `new stOpticInfo(...)` positional args after decoding — do not rely on
 * `parseHuaweiStructCall`, which would bind to the first `function stOpticInfo`
 * in the HTML and mis-align when the firmware uses the longer constructor.
 */
export const HUAWEI_ST_OPTIC_INFO_KEYS_12 = [
  'domain',
  'LinkStatus',
  'transOpticPower',
  'revOpticPower',
  'voltage',
  'temperature',
  'bias',
  'rfRxPower',
  'rfOutputPower',
  'VendorName',
  'VendorSN',
] as const;

export const HUAWEI_ST_OPTIC_INFO_KEYS_16 = [
  ...HUAWEI_ST_OPTIC_INFO_KEYS_12,
  'DateCode',
  'TxWaveLength',
  'RxWaveLength',
  'MaxTxDistance',
  'LosStatus',
] as const;

/** Same literal pattern as {@link HuaweiBaseDriver}'s `parseHuaweiStructCall`. */
export const HUAWEI_JS_STRING_LITERAL = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;

/**
 * `wan.asp` IP acquisition radios — `value` on `#IPv6AddressMode1`…`4` → visible label
 * (`docs/wan-example.asp`).
 */
export const HUAWEI_IPV6_ADDRESS_MODE_LABEL: Record<string, string> = {
  DHCPV6: 'DHCPv6',
  AUTOCONFIGURED: 'Automatic',
  STATIC: 'Static',
  NONE: 'None',
};

export const HUAWEI_COLON_MAC = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
