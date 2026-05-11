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
  SIMPLE_WIFI_CONFIG_AP: '/html/amp/wlanbasic/simplewificfgAP.asp',
  USER_DEVICE_INFO_SMART: '/html/bbsp/terminaldevinfo/userdevinfosmart.asp',
  /** Same `bbsp/common` LAN client scripts as {@link HuaweiEG8145V5Driver.getTopologyState}. */
  GET_LAN_USER_DEV_INFO: '/html/bbsp/common/GetLanUserDevInfo.asp',
  GET_LAN_USER_DHCP_INFO: '/html/bbsp/common/GetLanUserDhcpInfo.asp',
  LAN_USER_INFO: '/html/bbsp/common/lanuserinfo.asp',
  CONFIG_INDEX: '/configindex.asp',
  DEVICE_INFO_AP: '/html/ssmp/deviceinfo/deviceinfo_ap.asp',
  WLAN_ADVANCE_DEST_AP: '/html/amp/wlanadv/wlanadvanceDestAP.asp',
  LAN_DHCP_AP: '/html/bbsp/landhcp/landhcp_ap.asp',
  IPV6_AP: '/html/bbsp/ipv6/ipv6_ap.asp',
  UPNP_AP: '/html/bbsp/upnp/upnp_ap.asp',
  TR069_AP: '/html/ssmp/tr069/tr069.asp',
  DIAGNOSE_COMMON: '/html/bbsp/maintenance/diagnosecommon.asp',
};
