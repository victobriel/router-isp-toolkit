/**
 * CSS selectors for the ZTE ZXHN H199 router admin UI.
 *
 * For now, H199 and H3601 share an identical selector set. Keep this module as
 * a per-model wrapper so drivers can override only the differences.
 */
import { ZteCommonSelectors } from '@/infra/drivers/zte/ZteCommonSelectors';

export const ZteH198Selectors = {
  ...ZteCommonSelectors,
  netSphereContainer: '#smNetSphereMAP',
  netSphereStatusContainer: '#MAPMode',
  netSphereStatus: '#Enable0',
  netSphereModeSelect: '#Mode',
  netSphereModeSelectSubmitButton: '#Btn_apply_Mode',

  lanTopologyShowButton: '#master-device-lan-dev4',
  lanTopologyCount: '#master-device-lan-count',
  wlan24TopologyShowButton: '#master-device-2G-dev4',
  wlan24TopologyCount: '#master-device-2G-count',
  wlan5TopologyShowButton: '#master-device-5G-dev4',
  wlan5TopologyCount: '#master-device-5G-count',

  topologyPopup: '#Non1905AccessDevDiv_copy',
  topologyClosePopup: '#instDelete_AccessDev',
  topologyAccessDevSection: '#Non1905AccessDevDiv_copy',
  topologyAccessRows: 'div.colorTblRow[id^="data_AccessDev_"]',

  topologyPopupHostName: 'span[id^="HostName_"]',
  topologyPopupMacAddr: 'span[id^="MAC_"]',
  topologyPopupIpAddr: 'span[id^="IP_"]',
  topologyPopupRssi: 'span[id^="Rssi_"]',
} as const;
