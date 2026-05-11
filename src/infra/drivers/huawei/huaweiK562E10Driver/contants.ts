export const ENDPOINT = {
  INDEX: '/index.asp',
  /**
   * Same Huawei `bbsp/common` WAN bundle as {@link HuaweiEG8145V5Driver} /
   * `getWanDynamicData.asp`. `internetAP.asp` also pulls `wan_list_ap.asp`
   * (`../common/wan_list_ap.asp`); some builds expose WAN rows only there, so
   * {@link HuaweiK562E10Driver.getWanState} merges it with `wan_list.asp`.
   */
  WAN_LIST_INFO: '/html/bbsp/common/wan_list_info.asp',
  WAN_LIST: '/html/bbsp/common/wan_list.asp',
  WAN_LIST_AP: '/html/bbsp/common/wan_list_ap.asp',
  WAN_ADDRESS_ACQUIRE: '/html/bbsp/common/wanaddressacquire.asp',
  LAN_ADDRESS: '/html/bbsp/lanaddress/lanaddress.asp',
  MAIN_TOP_AP: '/html/bbsp/maintop/MainTopAP.asp',
  INTERNET_AP: '/html/bbsp/internet/InternetAP.asp',
  /**
   * On K562E-10 Desk AP builds, SSID / `stWlan` / `stPreSharedKey` data is served from this
   * script (see `docs/HuaweiK562E10/getWanDynamicData.asp`); it is not under `simplewificfgAP.asp`.
   */
  GET_WAN_DYNAMIC_DATA: '/html/bbsp/common/getWanDynamicData.asp',
  USER_DEVICE_INFO_SMART: '/html/bbsp/terminaldevinfo/userdevinfosmart.asp',
  CONFIG_INDEX: '/configindex.asp',
  DEVICE_INFO_AP: '/html/ssmp/deviceinfo/deviceinfo_ap.asp',
  WLAN_ADVANCE_DEST_AP: '/html/amp/wlanadv/wlanadvanceDestAP.asp',
  LAN_DHCP_AP: '/html/bbsp/landhcp/landhcp_ap.asp',
  IPV6_AP: '/html/bbsp/ipv6/ipv6_ap.asp',
  UPNP_AP: '/html/bbsp/upnp/upnp_ap.asp',
  TR069_AP: '/html/ssmp/tr069/tr069.asp',
  DIAGNOSE_COMMON: '/html/bbsp/maintenance/diagnosecommon.asp',
};
