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
