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
const HUAWEI_INDEX_ENDPOINT = '/index.asp';
const HUAWEI_WLAN24G_ENDPOINT = '/html/amp/wlanbasic/WlanBasic.asp?2G';
const HUAWEI_WLAN5G_ENDPOINT = '/html/amp/wlanbasic/WlanBasic.asp?5G';
const HUAWEI_WLAN24G_ADVANCED_ENDPOINT = '/html/amp/wlanadv/WlanAdvance.asp?2G';
const HUAWEI_WLAN5G_ADVANCED_ENDPOINT = '/html/amp/wlanadv/WlanAdvance.asp?5G';

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
};
