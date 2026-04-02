import { z } from 'zod';

const topologyClientSchema = z.object({
  name: z.string(),
  ip: z.string(),
  mac: z.string(),
  signal: z.number(),
});

const topologyBandSchema = z.object({
  clients: z.array(topologyClientSchema),
  totalClients: z.number(),
});

export const topologySchema = z.object({
  '24ghz': topologyBandSchema,
  '5ghz': topologyBandSchema,
  cable: topologyBandSchema,
});

export const wlanSsidExtractionEntrySchema = z
  .object({
    enabled: z.boolean(),
    ssidName: z.string(),
    ssidPassword: z.string(),
    ssidHideMode: z.boolean(),
    wpa2SecurityType: z.string(),
    maxClients: z.number(),
  })
  .partial();

export function wlanSsidPreferenceEntrySchema<T extends z.ZodType>(fieldSchema: T) {
  return z
    .object({
      ssidName: fieldSchema,
      ssidHideMode: z.boolean(),
      wpa2SecurityType: fieldSchema,
      maxClients: fieldSchema,
    })
    .partial();
}

export function routerStateShape<
  TRouterPassword extends z.ZodType,
  TPppoe extends z.ZodType,
  TLinkSpeed extends z.ZodType,
  TIpVersion extends z.ZodType,
  TTr069 extends z.ZodType,
  TWlan24Ssids extends z.ZodType,
  TWlan5Ssids extends z.ZodType,
  TDhcpIpAddress extends z.ZodType,
  TDhcpSubnetMask extends z.ZodType,
  TDhcpStartIp extends z.ZodType,
  TDhcpEndIp extends z.ZodType,
  TDhcpPrimaryDns extends z.ZodType,
  TDhcpSecondaryDns extends z.ZodType,
  TDhcpLeaseTimeMode extends z.ZodType,
  TWlanConfig extends z.ZodType,
>(params: {
  routerPassword: TRouterPassword;
  pppoeUsername: TPppoe;
  linkSpeed: TLinkSpeed;
  ipVersion: TIpVersion;
  tr069Url: TTr069;
  wlan24GhzSsids: TWlan24Ssids;
  wlan5GhzSsids: TWlan5Ssids;
  dhcpIpAddress: TDhcpIpAddress;
  dhcpSubnetMask: TDhcpSubnetMask;
  dhcpStartIp: TDhcpStartIp;
  dhcpEndIp: TDhcpEndIp;
  dhcpPrimaryDns: TDhcpPrimaryDns;
  dhcpSecondaryDns: TDhcpSecondaryDns;
  dhcpLeaseTimeMode: TDhcpLeaseTimeMode;
  wlanConfig: TWlanConfig;
}) {
  return {
    timestamp: z.string(),
    goToHomePage: z.boolean(),

    internetEnabled: z.boolean(),
    tr069Enabled: z.boolean(),
    bandSteeringEnabled: z.boolean(),
    upnpEnabled: z.boolean(),
    requestPdEnabled: z.boolean(),
    slaacEnabled: z.boolean(),
    dhcpv6Enabled: z.boolean(),
    pdEnabled: z.boolean(),
    remoteAccessIpv4Enabled: z.boolean(),
    remoteAccessIpv6Enabled: z.boolean(),
    dhcpEnabled: z.boolean(),
    dhcpIspDnsEnabled: z.boolean(),
    routerVersion: z.string(),
    dhcpLeaseTime: z.string(),

    linkSpeed: params.linkSpeed,
    routerPassword: params.routerPassword,
    pppoeUsername: params.pppoeUsername,
    ipVersion: params.ipVersion,
    tr069Url: params.tr069Url,

    wlan24GhzConfig: params.wlanConfig,
    wlan5GhzConfig: params.wlanConfig,
    wlan24GhzSsids: params.wlan24GhzSsids,
    wlan5GhzSsids: params.wlan5GhzSsids,

    dhcpIpAddress: params.dhcpIpAddress,
    dhcpSubnetMask: params.dhcpSubnetMask,
    dhcpStartIp: params.dhcpStartIp,
    dhcpEndIp: params.dhcpEndIp,
    dhcpPrimaryDns: params.dhcpPrimaryDns,
    dhcpSecondaryDns: params.dhcpSecondaryDns,
    dhcpLeaseTimeMode: params.dhcpLeaseTimeMode,
  };
}
