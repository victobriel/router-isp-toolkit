/**
 * Common driver wait-time constants shared by Huawei routers.
 *
 * If future models diverge, consider adding per-model overrides while keeping
 * the shared subset here.
 */
const HUAWEI_UPNP_ENDPOINT = '/html/bbsp/upnp/upnp.asp';
const HUAWEI_TR069_ENDPOINT = '/html/ssmp/tr069/tr069.asp';
const HUAWEI_ACCESS_CONTROL_ENDPOINT = '/html/bbsp/portacl/newacl.asp';
const HUAWEI_INDEX_ENDPOINT = '/index.asp';

export {
  HUAWEI_UPNP_ENDPOINT,
  HUAWEI_TR069_ENDPOINT,
  HUAWEI_ACCESS_CONTROL_ENDPOINT,
  HUAWEI_INDEX_ENDPOINT,
};
