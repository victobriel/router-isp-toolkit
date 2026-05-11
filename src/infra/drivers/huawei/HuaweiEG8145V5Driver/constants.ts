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
   * Diagnostics endpoints used by `HuaweiEG8145V5Driver.ping()` (the IP ping
   * implementation that previously lived on `HuaweiBaseDriver` for this firmware
   * only). The same `complex.cgi` action + `GetPingResult.asp` poll loop is what
   * `diagnosecommon.asp` itself uses (see `OnApply()` / `GetPingResult()` in
   * `docs/diagnosecommon-example.asp`).
   */
  DIAGNOSE_COMMON: '/html/bbsp/maintenance/diagnosecommon.asp',
  PING_DIAGNOSE:
    '/html/bbsp/maintenance/complex.cgi' +
    '?x=InternetGatewayDevice.IPPingDiagnostics' +
    '&RUNSTATE_FLAG=Ping' +
    '&RequestFile=html/bbsp/maintenance/diagnosecommon.asp',
  GET_PING_RESULT: '/html/bbsp/maintenance/GetPingResult.asp',

  /**
   * Used by `HuaweiEG8145V5Driver.reboot()` — same flow as the firmware's own
   * `ResetONT()` in `mainpage.asp` (`docs/HuaweiEG8145V5/mainpage.asp:754`):
   * a hidden-form POST to `set.cgi` with the TR-069 `ResetBoard` action and a
   * fresh `onttoken` from `mainpage.asp`. The path `/CustomApp/mainpage.asp`
   * is implied by mainpage's relative iframe srcs (e.g. `../html/ssmp/...`
   * resolving to `/html/ssmp/...`) — `set.cgi` lives next to it.
   *
   * `RequestFile` is firmware-internal (where set.cgi redirects on success);
   * we mirror the original `../CustomApp/mainpage.asp` byte-for-byte so the
   * firmware accepts it without surprises (we don't actually consume the
   * redirected response — the box is rebooting).
   */
  MAIN_PAGE: '/CustomApp/mainpage.asp',
  RESET_BOARD:
    '/CustomApp/set.cgi' +
    '?x=InternetGatewayDevice.X_HW_DEBUG.SMP.DM.ResetBoard' +
    '&RequestFile=../CustomApp/mainpage.asp',
};

/**
 * IP ping diagnostics for this model: TR-069 IPPingDiagnostics wired like
 * `diagnosecommon.asp` (`OnApply` / `GetPingResult`). These values support
 * `HuaweiEG8145V5Driver.ping()`; URLs are `ENDPOINT.DIAGNOSE_COMMON`,
 * `ENDPOINT.PING_DIAGNOSE`, and `ENDPOINT.GET_PING_RESULT` above.
 * (Implementation lives on the driver, not `HuaweiBaseDriver`.)
 */

/** Mirrors `splitobj` in `diagnosecommon.asp` — separates ping body from status. */
export const HUAWEI_PING_RESULT_DELIMITER = '[@#@]';

export const HUAWEI_PING_DEFAULT_REPETITIONS = 4;
export const HUAWEI_PING_DEFAULT_DATA_BLOCK_SIZE = 56;
export const HUAWEI_PING_DEFAULT_TIMEOUT_MS = 10_000;
export const HUAWEI_PING_DEFAULT_DSCP = 0;
export const HUAWEI_PING_POLL_INTERVAL_MS = 1_000;
export const HUAWEI_PING_POLL_GRACE_MS = 5_000;

/** BusyBox `ping` reply line: `64 bytes from 1.2.3.4: seq=0 ttl=64 time=12.345 ms`. */
export const HUAWEI_PING_REPLY_LINE =
  /^(\d+)\s+bytes\s+from\s+\S+?:\s+seq=(\d+)\s+ttl=(\d+)\s+time=([\d.]+)\s*ms/i;

/** BusyBox stats: `2 packets transmitted, 2 packets received, 0% packet loss`. */
export const HUAWEI_PING_STATS_LINE =
  /(\d+)\s+packets\s+transmitted,\s*(\d+)\s+(?:packets\s+)?received(?:[^,]*)?,\s*(\d+)%\s*packet\s*loss/i;

/** BusyBox RTT: `round-trip min/avg/max = 1.234/2.345/3.456 ms`. */
export const HUAWEI_PING_RTT_LINE = /min\/avg\/max\s*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/i;

/** `PING 1.2.3.4 (1.2.3.4): 56 data bytes`. */
export const HUAWEI_PING_HEADER_LINE = /^PING\s+\S+\s+\(\S+\):\s+(\d+)\s+data\s+bytes/i;

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
