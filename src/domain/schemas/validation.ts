import { z } from 'zod';

export enum DiagnosticsMode {
  INTERNAL = 'internal',
  EXTERNAL = 'external',
}

export type ValidationIssue = z.ZodIssue;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

export const CredentialsSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const ExtractionResultSchema = z.object({
  linkSpeed: z.string().optional(),
  //
  internetEnabled: z.boolean().optional(),
  tr069Enabled: z.boolean().optional(),
  pppoeUsername: z.string().optional(),
  ipVersion: z.string().nullable().optional(),
  requestPdEnabled: z.boolean().optional(),
  slaacEnabled: z.boolean().optional(),
  dhcpv6Enabled: z.boolean().optional(),
  pdEnabled: z.boolean().optional(),
  //
  remoteAccessIpv4Enabled: z.boolean().optional(),
  remoteAccessIpv6Enabled: z.boolean().optional(),
  //
  topology: z
    .object({
      '24ghz': z.object({
        clients: z.array(
          z.object({
            name: z.string(),
            ip: z.string(),
            mac: z.string(),
            signal: z.number(),
          }),
        ),
        totalClients: z.number(),
      }),
      '5ghz': z.object({
        clients: z.array(
          z.object({
            name: z.string(),
            ip: z.string(),
            mac: z.string(),
            signal: z.number(),
          }),
        ),
        totalClients: z.number(),
      }),
      cable: z.object({
        clients: z.array(
          z.object({
            name: z.string(),
            ip: z.string(),
            mac: z.string(),
            signal: z.number(),
          }),
        ),
        totalClients: z.number(),
      }),
    })
    .optional(),
  //
  bandSteeringEnabled: z.boolean().optional(),
  //
  wlan24GhzConfig: z
    .object({
      enabled: z.boolean(),
      channel: z.string(),
      mode: z.string(),
      bandWidth: z.string(),
      transmittingPower: z.string(),
    })
    .optional(),
  wlan5GhzConfig: z
    .object({
      enabled: z.boolean(),
      channel: z.string(),
      mode: z.string(),
      bandWidth: z.string(),
      transmittingPower: z.string(),
    })
    .optional(),
  /**
   * Some routers support multiple SSIDs per band.
   * When present, these arrays list all configured SSIDs for the band.
   * The legacy single-band config fields above continue to represent
   * the primary SSID to preserve backward compatibility.
   */
  wlan24GhzSsids: z
    .array(
      z.object({
        enabled: z.boolean(),
        ssidName: z.string(),
        ssidPassword: z.string(),
        ssidHideMode: z.boolean(),
        wpa2SecurityType: z.string(),
        maxClients: z.number(),
      }),
    )
    .optional(),
  wlan5GhzSsids: z
    .array(
      z.object({
        enabled: z.boolean(),
        ssidName: z.string(),
        ssidPassword: z.string(),
        ssidHideMode: z.boolean(),
        wpa2SecurityType: z.string(),
        maxClients: z.number(),
      }),
    )
    .optional(),
  //
  dhcpEnabled: z.boolean().optional(),
  dhcpIpAddress: z.string().optional(),
  dhcpSubnetMask: z.string().optional(),
  dhcpStartIp: z.string().optional(),
  dhcpEndIp: z.string().optional(),
  dhcpIspDnsEnabled: z.boolean().optional(),
  dhcpPrimaryDns: z.string().optional(),
  dhcpSecondaryDns: z.string().optional(),
  dhcpLeaseTimeMode: z.string().optional(),
  dhcpLeaseTime: z.string().optional(),
  timestamp: z.string().optional(),
  //
  upnpEnabled: z.boolean().optional(),
  //
  routerVersion: z.string().optional(),
  //
  tr069Url: z.string().optional(),
});

export enum CollectMessageAction {
  AUTHENTICATE = 'authenticate',
  COLLECT = 'collect',
  PING = 'ping',
}

export const CollectMessageSchema = z.object({
  action: z.enum(
    [CollectMessageAction.AUTHENTICATE, CollectMessageAction.COLLECT, CollectMessageAction.PING],
    'Invalid action type',
  ),
  credentials: z
    .object({
      username: z.string(),
      password: z.string(),
    })
    .optional(),
  ip: z.ipv4().optional(),
});

export const PingTestResultSchema = z.object({
  ip: z.ipv4(),
  bytes: z.number().optional(),
  ttl: z.number().optional(),
  time: z.array(z.number()).optional(),
  sequence: z.array(z.number()).optional(),
  packets: z.object({
    transmitted: z.number().optional(),
    received: z.number().optional(),
    loss: z.number().optional(),
    min: z.number().optional(),
    avg: z.number().optional(),
    max: z.number().optional(),
  }),
  message: z.string(),
});

export type Credentials = z.infer<typeof CredentialsSchema>;
export type CollectMessage = z.infer<typeof CollectMessageSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
export type PingTestResult = z.infer<typeof PingTestResultSchema>;

export function validateCredentials(raw: unknown): ValidationResult<Credentials> {
  const result = CredentialsSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, issues: result.error.issues };
}

export function validateCollectMessage(raw: unknown): ValidationResult<CollectMessage> {
  const result = CollectMessageSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, issues: result.error.issues };
}

export function createExtractionResult(
  raw: unknown,
  options?: { withTimestamp?: boolean },
): ValidationResult<ExtractionResult> {
  const base = typeof raw === 'object' && raw !== null ? (raw as object) : ({} as object);

  const payload =
    options?.withTimestamp === false ? base : { ...base, timestamp: new Date().toISOString() };

  const result = ExtractionResultSchema.safeParse(payload as unknown);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, issues: result.error.issues };
}

export interface ButtonConfig {
  targetSelector: string;
  text: string;
  style: string;
}
