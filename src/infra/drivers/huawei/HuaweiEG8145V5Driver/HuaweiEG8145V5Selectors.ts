import { HuaweiCommonSelectors } from '../shared/HuaweiCommonSelectors';

export const HuaweiEG8145V5Selectors = {
  ...HuaweiCommonSelectors,

  username: '#txt_Username, input[name="txt_Username"]',
  password: '#txt_Password, input[name="txt_Password"]',
  submit: '#loginbutton, input[type="button"]',

  // Main menu
  homeTab: '#name_MainPage',
  systemInformationTab: '#name_Systeminfo',
  advancedTab: '#name_addconfig',

  // Advanced menu
  advWanTab: '#name_wanconfig',
  advLanTab: '#name_lanconfig',
  advApplicationTab: '#name_application',
  advWlanTab: '#name_wlanconfig',
  advSystemTab: '#name_systool',

  // Topology
  wifiTopologyButton: '#wifidevIcon',
  wifiTopologyCount: '#wifinumspan',
  topologyTable: '#devlist',
  wiredTopologyButton: '#linedevIcon',

  routerRebootButton: '#RestartIcon',
  routerRebootConfirmButton: '#btnReboot, input[type="button"]',

  // System information
  siDeviceInfoContainer: '#name_deviceinfo',
  siDeviceType: '#td1_2',
  siVersion: '#td5_2',

  siOpticalContainer: '#name_opticinfo',
  siRxOpticalPower: '#optic_status_table > tbody > tr:nth-child(7) > td:nth-child(2)',

  advWanPppoeButton: '#wanInstTable_rml0, input[name="wanInstTablerml"]',

  // WAN
  advWanEnable: '#WanSwitch, input[type="checkbox"]',
  advPppoeUsername: '#UserName, input[type="text"]',
  advPdEnable: '#IPv6PrefixMode1, input[type="radio"]',
  advDhcpv6Enable: '#IPv6AddressMode, input[type="radio"]',

  // LAN
  advLanDhcpServerContainer: '#landhcp',
  advLanDhcpHostIp: '#LanHostIP',
  advLanDhcpSubnetMask: '#LanHostMask',
  advLanDhcpStartIp: '#mainstartipaddr, input[type="text"]',
  advLanDhcpEndIp: '#mainendipaddr, input[type="text"]',
  advLanLeaseTime1: '#MainLeasedTime, input[type="text"]',
  advLanLeaseTime2: '#maindhcpLeasedTimeFrag',
  advLanPrimaryDns: '#dnsMainPri, input[type="text"]',
  advLanSecondaryDns: '#dnsMainSec, input[type="text"]',
  advLanDhcpServerEnable: '#dhcpSrvType, input[type="checkbox"]',
  advLanDhcpRelayEnable: '#dhcpL2relay, input[type="checkbox"]',

  // DHCPv6
  advDhcpv6Container: '#landhcpv6',
  advDhcpv6AddressPrefixModeSlaac: '#AssignType2, input[type="radio"]',
  advDhcpv6OtherInformationModeSlaac: '#OtherType2, input[type="radio"]',

  // UPNP
  advUpnpTab: '#upnp',
  advUpnpEnabled: '#Enable, input[type="checkbox"]',

  // WLAN 2.4GHz
  advWlan24GhzBasicTab: '#wlan2basic',
  advWlan24GhzSsidName: '#wlSsid',
  advWlan24GhzSsidEnabled: '#wlEnable, input[type="checkbox"]',
  advWlan24GhzSsidMaxClients: '#X_HW_AssociateNum, input[type="text"]',
  advWlan24GhzSsidHideMode: '#wlHide, input[type="checkbox"]',
  advWlan24GhzSsidWpa2SecurityType: '#wlAuthMode',
  advWlan24GhzSsidEncryptionType: '#wlEncryption',
  advWlan24GhzSsidPassword: '#wlWpaPsk, input[type="password"]',

  advWlan24GhzAdvancedTab: '#wlan2adv',
  advWlan24GhzTransmittingPower: '#TransmitPower',
  advWlan24GhzChannel: '#Channel',
  advWlan24GhzBandWidth: '#X_HW_HT20',
  advWlan24GhzMode: '#X_HW_Standard',

  // WLAN 5GHz
  advWlan5GhzBasicTab: '#wlan5basic',
  advWlan5GhzSsidName: '#wlSsid',
  advWlan5GhzSsidEnabled: '#wlEnable, input[type="checkbox"]',
  advWlan5GhzSsidMaxClients: '#X_HW_AssociateNum, input[type="text"]',
  advWlan5GhzSsidHideMode: '#wlHide, input[type="checkbox"]',
  advWlan5GhzSsidWpa2SecurityType: '#wlAuthMode',
  advWlan5GhzSsidEncryptionType: '#wlEncryption',
  advWlan5GhzSsidPassword: '#wlWpaPsk, input[type="password"]',

  advWlan5GhzAdvancedTab: '#wlan5adv',
  advWlan5GhzTransmittingPower: '#TransmitPower',
  advWlan5GhzChannel: '#Channel',
  advWlan5GhzBandWidth: '#X_HW_HT20',
  advWlan5GhzMode: '#X_HW_Standard',

  // TR-069
  advTr069Tab: '#tr069config',
  advTr069Enabled: '#EnableCWMP, input[type="checkbox"]',
  advTr069Url: '#URL, input[type="text"]',

  // Account Management
  advAccountManagementTab: '#userconfig',

  // Software Update
  advSoftwareUpdateTab: '#fireware',
  advSoftwareUpdateBrowseButton: '#t_file',

  // Maintenance
  advMaintenanceTab: '#maintainconfig',
  advMaintenancePingTargetIp: '#IPAddress, input[type="text"]',
  advMaintenancePingButton: '#ButtonApply',
} as const;
