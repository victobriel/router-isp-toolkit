/**
 * CSS selectors for the ZTE ZXHN H3601 router admin UI.
 * Used by ZteH3601Driver for navigation and data extraction.
 */
export const ZteH3601Selectors = {
  // Login
  username: '#Frm_Username, input[name="Frm_Username"]',
  password: '#Frm_Password, input[name="Frm_Password"]',
  submit: '#LoginId, button[type="submit"]',

  // Main menu
  homeTab: "#homePage",
  topologyTab: "#mmTopology",
  internetTab: "#internet",
  localNetworkTab: "#localnet",
  managementTab: "#mgrAndDiag",

  // Internet -> Status
  linkSpeed: "#cLinkSpeed\\:0",

  // Internet -> WAN
  wanContainer: "#internetConfig",

  // Internet -> WAN -> PPPoE
  pppoeEntry: "#instName_Internet\\:0",
  serviceListInternet: "#Servlist_INTERNET\\:0",
  serviceListTr069: "#Servlist_TR069\\:0",
  pppoeUsername:
    '#UserName\\:0, [id="UserName:0"], [name="UserName:0"], input[name*="UserName"]',
  ipMode:
    '#IpMode\\:0, [id="IpMode:0"], [name="IpMode:0"], select[name*="IpMode"]',
  requestPd: "#IsPD1\\:0",
  slaac: "#IsSLAAC\\:0",
  dhcpv6: "#IsGUA\\:0",
  pdAddress: "#IsPdAddr\\:0",

  // Security
  securityContainer: "#security",

  // Security -> Remote access
  localServiceControl: "#localServiceCtrl",
  serviceControlBar: "#serviceCtlBar",
  ipv4RemoteAccessToggle: "#Enable1\\:serviceCtl\\:0",
  ipv6ServiceControlBar: "#IPv6serviceCtlBar",
  ipv6RemoteAccessToggle: "#Enable1\\:IPv6serviceCtl\\:0",

  // Topology -> All clients (SVG + popup + legacy)
  allClientsSection: "#clientFormBar",
  clientFormContainer: "#PopDevData_container, #clientFormContainer",
  topologyRouterCircles: "circle.router[id]",
  topologyPopup: "#PopDevDataDiv_copy",
  topologyPopupWaitRows:
    "#PopDevDataDiv_copy div.devTblRow[id^='data_laninfo_'], #PopDevDataDiv_copy div.devTblRow[id^='data_wlan2Ginfo_'], #PopDevDataDiv_copy div.devTblRow[id^='data_wlan5Ginfo_']",
  lanAccessSection: "#lan_accessdev",
  lanAccessRows: 'div.devTblRow[id^="data_laninfo_"]',
  lanHostName: 'span[id^="HostName_"]',
  lanMacAddr: 'span[id^="MacAddr_"]',
  lanIpAddr: 'span[id^="IpAddr_"]',
  wlan2Section: "#wlan2G_accessdev",
  wlan2Rows: 'div.devTblRow[id^="data_wlan2Ginfo_"]',
  wlan2HostName: 'span[id^="HostName_"]',
  wlan2MacAddr: 'span[id^="MacAddr_"]',
  wlan2IpAddr: 'span[id^="IpAddr_"]',
  wlan2Rssi: 'span[id^="Rssi_"]',
  wlan5Section: "#wlan5G_accessdev",
  wlan5Rows: 'div.devTblRow[id^="data_wlan5Ginfo_"]',
  wlan5HostName: 'span[id^="HostName_"]',
  wlan5MacAddr: 'span[id^="MacAddr_"]',
  wlan5IpAddr: 'span[id^="IpAddr_"]',
  wlan5Rssi: 'span[id^="Rssi_"]',

  // Local Network
  wlanContainer: "#wlanConfig",

  // Local Network -> WLAN -> Band Steering
  bandSteeringContainer: "#wlanbandsteer",
  bandSteeringEnabled: "#BandSteering1",

  // Local Network -> WLAN -> Basic
  wlanBasicContainer: "#wlanBasic",

  // Local Network -> WLAN -> On/Off Configuration
  wlan24GhzRadioStatus: "#RadioStatus0_0",
  wlan5GhzRadioStatus: "#RadioStatus0_1",

  // Local Network -> WLAN -> Basic -> Global Config
  wlanGlobalConfigContainer: "#WlanBasicAdConfBar",

  // Local Network -> WLAN -> Basic -> Global Config -> 2.4GHz
  wlan24GhzChannel: "#UI_Channel\\:0",
  wlan24GhzMode: "#UI_Standard\\:0",
  wlan24GhzBandWidth: "#UI_BandWidth\\:0",
  wlan24GhzTransmittingPower: "#TxPower\\:0",

  // Local Network -> WLAN -> Basic -> Global Config -> 5GHz
  wlan5GhzGlobalConfigContainer: "#instName_WlanBasicAdConf\\:1",
  wlan5GhzChannel: "#UI_Channel\\:1",
  wlan5GhzMode: "#UI_Standard\\:1",
  wlan5GhzBandWidth: "#UI_BandWidth\\:1",
  wlan5GhzTransmittingPower: "#TxPower\\:1",

  // Local Network -> WLAN -> Basic -> SSID Config
  wlanSsidConfigContainer: "#WLANSSIDConfBar",

  // Local Network -> WLAN -> Basic -> SSID Config -> 2.4GHz
  wlan24GhzSsidEnabled: "#Enable1\\:0",
  wlan24GhzSsidName: "#ESSID\\:0",
  wlan24GhzSsidHideMode: "#ESSIDHideEnable0\\:0",
  wlan24GhzSsidWpa2SecurityType: "#EncryptionType\\:0",
  wlan24GhzSsidPassword: "#KeyPassphrase\\:0",
  wlan24GhzSsidMaxClients: "#MaxUserNum\\:0",
  wlan24GhzShowPasswordButton: "#Switch_KeyPassType\\:0",

  // Local Network -> WLAN -> Basic -> SSID Config -> 5GHz
  wlan5GhzSsidConfigContainer: "#instName_WLANSSIDConf\\:4",
  wlan5GhzSsidEnabled: "#Enable1\\:4",
  wlan5GhzSsidName: "#ESSID\\:4",
  wlan5GhzSsidHideMode: "#ESSIDHideEnable0\\:4",
  wlan5GhzSsidWpa2SecurityType: "#EncryptionType\\:4",
  wlan5GhzSsidPassword: "#KeyPassphrase\\:4",
  wlan5GhzSsidMaxClients: "#MaxUserNum\\:4",
  wlan5GhzShowPasswordButton: "#Switch_KeyPassType\\:4",

  // Local Network -> LAN
  lanContainer: "#lanConfig",
  dhcpServerContainer: "#DHCPBasicCfgBar",
  dhcpEnabled: "#ServerEnable1",
  dhcpIpAddressField1: "input[id^='sub_IPAddr0:DHCPBasicCfg']",
  dhcpIpAddressField2: "input[id^='sub_IPAddr1:DHCPBasicCfg']",
  dhcpIpAddressField3: "input[id^='sub_IPAddr2:DHCPBasicCfg']",
  dhcpIpAddressField4: "input[id^='sub_IPAddr3:DHCPBasicCfg']",
  dhcpSubnetMaskField1: "input[id^='sub_SubMask0']",
  dhcpSubnetMaskField2: "input[id^='sub_SubMask1']",
  dhcpSubnetMaskField3: "input[id^='sub_SubMask2']",
  dhcpSubnetMaskField4: "input[id^='sub_SubMask3']",
  dhcpStartIpField1: "input[id^='sub_MinAddress0:DHCPBasicCfg']",
  dhcpStartIpField2: "input[id^='sub_MinAddress1:DHCPBasicCfg']",
  dhcpStartIpField3: "input[id^='sub_MinAddress2:DHCPBasicCfg']",
  dhcpStartIpField4: "input[id^='sub_MinAddress3:DHCPBasicCfg']",
  dhcpEndIpField1: "input[id^='sub_MaxAddress0:DHCPBasicCfg']",
  dhcpEndIpField2: "input[id^='sub_MaxAddress1:DHCPBasicCfg']",
  dhcpEndIpField3: "input[id^='sub_MaxAddress2:DHCPBasicCfg']",
  dhcpEndIpField4: "input[id^='sub_MaxAddress3:DHCPBasicCfg']",
  dhcpIspDnsEnabled: "#DnsServerSource1",
  dhcpPrimaryDnsField1: "input[id^='sub_DNSServer10']",
  dhcpPrimaryDnsField2: "input[id^='sub_DNSServer11']",
  dhcpPrimaryDnsField3: "input[id^='sub_DNSServer12']",
  dhcpPrimaryDnsField4: "input[id^='sub_DNSServer13']",
  dhcpSecondaryDnsField1: "input[id^='sub_DNSServer20']",
  dhcpSecondaryDnsField2: "input[id^='sub_DNSServer21']",
  dhcpSecondaryDnsField3: "input[id^='sub_DNSServer22']",
  dhcpSecondaryDnsField4: "input[id^='sub_DNSServer23']",
  dhcpLeaseTimeMode: "#LeaseTimeMode",
  dhcpLeaseTime: "#LeaseTimeSelfDefine",

  // Local Network -> UPnP
  upnpContainer: "#upnp",
  upnpEnabled: "input[id^='OBJ_UPNPCONFIG_ID.EnableUPnPIGD1:LocalUPnP']",

  // Management -> Router Version
  routerVersionContainer: "#statusMgr",
  routerVersion: "#SoftwareVer",

  // Management -> TR069 URL
  tr069UrlContainer: "#remoteMgr",
  tr069Url: "#URL",

  // Management -> Ping
  diagnosticsContainer: "#networkDiag",
  diagnosticsPingContainer: "#instName_PingDiagnosis",
  diagnosticsPingIpAddress: "#Host\\:PingDiagnosis",
  pingSendButton: "#Btn_PingDiagnosis",
  pingResult: "#PingAck",
  pingWaiting: "#confirmLayer",
} as const;

/** Login form selectors for Router base class (password may include fallbacks). */
export const ZteH3601LoginSelectors = {
  username: ZteH3601Selectors.username,
  password: '#Frm_Password, input[name="Frm_Password"], input[type="password"]',
} as const;
