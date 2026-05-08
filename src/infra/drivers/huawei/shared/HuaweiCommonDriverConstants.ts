/**
 * Common driver wait-time constants shared by Huawei routers.
 *
 * If future models diverge, consider adding per-model overrides while keeping
 * the shared subset here.
 */
const HUAWEI_WAN_ENDPOINT = '/html/bbsp/wan/wan.asp';
const HUAWEI_WAN_LIST_INFO_ENDPOINT = '/html/bbsp/common/wan_list_info.asp';
const HUAWEI_WAN_LIST_ENDPOINT = '/html/bbsp/common/wan_list.asp';
const HUAWEI_WAN_ADDRESS_ACQUIRE_ENDPOINT = '/html/bbsp/common/wanaddressacquire.asp';
const HUAWEI_UPNP_ENDPOINT = '/html/bbsp/upnp/upnp.asp';
const HUAWEI_TR069_ENDPOINT = '/html/ssmp/tr069/tr069.asp';
const HUAWEI_ACCESS_CONTROL_ENDPOINT = '/html/bbsp/portacl/newacl.asp';
// const HUAWEI_INDEX_ENDPOINT = '/index.asp';
const HUAWEI_WLAN24G_ENDPOINT = '/html/amp/wlanbasic/WlanBasic.asp?2G';
const HUAWEI_WLAN5G_ENDPOINT = '/html/amp/wlanbasic/WlanBasic.asp?5G';
const HUAWEI_WLAN24G_ADVANCED_ENDPOINT = '/html/amp/wlanadv/WlanAdvance.asp?2G';
const HUAWEI_WLAN5G_ADVANCED_ENDPOINT = '/html/amp/wlanadv/WlanAdvance.asp?5G';
const HUAWEI_OPTICAL_INFO_ENDPOINT = '/html/amp/opticinfo/opticinfo.asp';
/** Scripts included by `mainpage.asp`; `GetLanUserInfo` / `USERDevice` list LAN clients. */
const HUAWEI_GET_LAN_USER_DEV_INFO_ENDPOINT = '/html/bbsp/common/GetLanUserDevInfo.asp';
/** Some builds expose the same `USERDevice` list under a DHCP-specific script name. */
const HUAWEI_GET_LAN_USER_DHCP_INFO_ENDPOINT = '/html/bbsp/common/GetLanUserDhcpInfo.asp';
const HUAWEI_LAN_USER_INFO_ENDPOINT = '/html/bbsp/common/lanuserinfo.asp';
const HUAWEI_LAN_INFO_ENDPOINT = '/html/bbsp/dhcpservercfg/dhcp2.asp';
const HUAWEI_IPV6_INFO_ENDPOINT = '/html/bbsp/lanaddress/lanaddress.asp';
const HUAWEI_DEVICE_INFO_ENDPOINT = '/html/ssmp/deviceinfo/deviceinfo.asp';

/**
 * Diagnostics endpoints used by `ping()`. The same `complex.cgi` action +
 * `GetPingResult.asp` poll loop is what `diagnosecommon.asp` itself uses
 * (see `OnApply()` / `GetPingResult()` in `docs/diagnosecommon-example.asp`).
 */
const HUAWEI_DIAGNOSE_PAGE_ENDPOINT = '/html/bbsp/maintenance/diagnosecommon.asp';
const HUAWEI_PING_START_ENDPOINT =
  '/html/bbsp/maintenance/complex.cgi' +
  '?x=InternetGatewayDevice.IPPingDiagnostics' +
  '&RUNSTATE_FLAG=Ping' +
  '&RequestFile=html/bbsp/maintenance/diagnosecommon.asp';
const HUAWEI_PING_POLL_ENDPOINT = '/html/bbsp/maintenance/GetPingResult.asp';

export {
  HUAWEI_WAN_ENDPOINT,
  HUAWEI_WAN_LIST_INFO_ENDPOINT,
  HUAWEI_WAN_LIST_ENDPOINT,
  HUAWEI_WAN_ADDRESS_ACQUIRE_ENDPOINT,
  HUAWEI_UPNP_ENDPOINT,
  HUAWEI_TR069_ENDPOINT,
  HUAWEI_ACCESS_CONTROL_ENDPOINT,
  HUAWEI_INDEX_ENDPOINT,
  HUAWEI_WLAN24G_ENDPOINT,
  HUAWEI_WLAN5G_ENDPOINT,
  HUAWEI_WLAN24G_ADVANCED_ENDPOINT,
  HUAWEI_WLAN5G_ADVANCED_ENDPOINT,
  HUAWEI_OPTICAL_INFO_ENDPOINT,
  HUAWEI_GET_LAN_USER_DEV_INFO_ENDPOINT,
  HUAWEI_GET_LAN_USER_DHCP_INFO_ENDPOINT,
  HUAWEI_LAN_USER_INFO_ENDPOINT,
  HUAWEI_LAN_INFO_ENDPOINT,
  HUAWEI_DIAGNOSE_PAGE_ENDPOINT,
  HUAWEI_PING_START_ENDPOINT,
  HUAWEI_PING_POLL_ENDPOINT,
  HUAWEI_IPV6_INFO_ENDPOINT,
  HUAWEI_DEVICE_INFO_ENDPOINT,
};
