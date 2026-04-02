export type RouterPreferencesComparison = {
  routerPassword?: boolean;

  // WAN / overall features
  internetEnabled?: boolean;
  tr069Enabled?: boolean;
  bandSteeringEnabled?: boolean;
  upnpEnabled?: boolean;
  requestPdEnabled?: boolean;
  slaacEnabled?: boolean;
  dhcpv6Enabled?: boolean;
  pdEnabled?: boolean;
  remoteAccessIpv4Enabled?: boolean;
  remoteAccessIpv6Enabled?: boolean;
  linkSpeed?: boolean;
  routerVersion?: boolean;
  tr069Url?: boolean;
  pppoeUsername?: boolean;
  ipVersion?: boolean;

  // DHCP
  dhcpEnabled?: boolean;
  dhcpIpAddress?: boolean;
  dhcpSubnetMask?: boolean;
  dhcpStartIp?: boolean;
  dhcpEndIp?: boolean;
  dhcpIspDnsEnabled?: boolean;
  dhcpPrimaryDns?: boolean;
  dhcpSecondaryDns?: boolean;
  dhcpLeaseTimeMode?: boolean;
  dhcpLeaseTime?: boolean;

  // WiFi 2.4 GHz
  wlan24GhzRadioEnabled?: boolean;
  wlan24GhzChannel?: boolean;
  wlan24GhzMode?: boolean;
  wlan24GhzBandWidth?: boolean;
  wlan24GhzTransmittingPower?: boolean;

  // WiFi 5 GHz
  wlan5GhzRadioEnabled?: boolean;
  wlan5GhzChannel?: boolean;
  wlan5GhzMode?: boolean;
  wlan5GhzBandWidth?: boolean;
  wlan5GhzTransmittingPower?: boolean;

  wlan24GhzSsids?: Array<{
    ssidName?: boolean;
    ssidHideMode?: boolean;
    wpa2SecurityType?: boolean;
    maxClients?: boolean;
  }>;
  wlan5GhzSsids?: Array<{
    ssidName?: boolean;
    ssidHideMode?: boolean;
    wpa2SecurityType?: boolean;
    maxClients?: boolean;
  }>;
};
