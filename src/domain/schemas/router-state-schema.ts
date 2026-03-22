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

export const wlanSsidExtractionEntrySchema = z.object({
  enabled: z.boolean(),
  ssidName: z.string(),
  ssidPassword: z.string(),
  ssidHideMode: z.boolean(),
  wpa2SecurityType: z.string(),
  maxClients: z.number(),
});

const wlanConfigSchema = z.object({
  enabled: z.boolean(),
  channel: z.string(),
  mode: z.string(),
  bandWidth: z.string(),
  transmittingPower: z.string(),
});

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
  TPppoe extends z.ZodType,
  TIpVersion extends z.ZodType,
  TIpOrPattern extends z.ZodType,
  TTr069 extends z.ZodType,
  TWlan24Ssids extends z.ZodType,
  TWlan5Ssids extends z.ZodType,
>(params: {
  pppoeUsername: TPppoe;
  ipVersion: TIpVersion;
  ipOrPattern: TIpOrPattern;
  tr069Url: TTr069;
  wlan24GhzSsids: TWlan24Ssids;
  wlan5GhzSsids: TWlan5Ssids;
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

    linkSpeed: z.string(),
    routerVersion: z.string(),
    dhcpIpAddress: z.string(),
    dhcpSubnetMask: z.string(),
    dhcpStartIp: z.string(),
    dhcpEndIp: z.string(),
    dhcpPrimaryDns: z.string(),
    dhcpSecondaryDns: z.string(),
    dhcpLeaseTimeMode: z.string(),
    dhcpLeaseTime: z.string(),

    wlan24GhzConfig: wlanConfigSchema.partial(),
    wlan5GhzConfig: wlanConfigSchema.partial(),

    pppoeUsername: params.pppoeUsername,
    ipVersion: params.ipVersion,
    ipOrPattern: params.ipOrPattern,
    tr069Url: params.tr069Url,
    wlan24GhzSsids: params.wlan24GhzSsids,
    wlan5GhzSsids: params.wlan5GhzSsids,
  };
}
