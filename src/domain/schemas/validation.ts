import { z } from "zod";

export type ValidationIssue = z.ZodIssue;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

export const CredentialsSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
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
      "24ghz": z.object({
        clients: z.array(
          z.object({
            name: z.string(),
            ip: z.string(),
            mac: z.string(),
            signal: z.number(),
          })
        ),
      }),
      "5ghz": z.object({
        clients: z.array(
          z.object({
            name: z.string(),
            ip: z.string(),
            mac: z.string(),
            signal: z.number(),
          })
        ),
      }),
      cable: z.object({
        clients: z.array(
          z.object({
            name: z.string(),
            ip: z.string(),
            mac: z.string(),
            signal: z.number(),
          })
        ),
      }),
    })
    .optional(),
  //
  bandSteeringEnabled: z.boolean().optional(),
  //
  wlan24GhzConfig: z
    .object({
      enabled: z.boolean(),
      channel: z.number(),
      mode: z.string(),
      bandWidth: z.string(),
      transmittingPower: z.string(),
      ssidName: z.string(),
      ssidPassword: z.string(),
      ssidHideMode: z.string(),
      wpa2SecurityType: z.string(),
      maxClients: z.number(),
    })
    .optional(),
  wlan5GhzConfig: z
    .object({
      enabled: z.boolean(),
      channel: z.number(),
      mode: z.string(),
      bandWidth: z.string(),
      transmittingPower: z.string(),
      ssidName: z.string(),
      ssidPassword: z.string(),
      ssidHideMode: z.string(),
      wpa2SecurityType: z.string(),
      maxClients: z.number(),
    })
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

export const CollectMessageSchema = z.object({
  action: z.enum(["authenticate", "collect"], "Invalid action type"),
  credentials: z
    .object({
      username: z.string(),
      password: z.string(),
    })
    .optional(),
});

export type Credentials = z.infer<typeof CredentialsSchema>;
export type CollectMessage = z.infer<typeof CollectMessageSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export function validateCredentials(
  raw: unknown
): ValidationResult<Credentials> {
  const result = CredentialsSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, issues: result.error.issues };
}

export function validateCollectMessage(
  raw: unknown
): ValidationResult<CollectMessage> {
  const result = CollectMessageSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, issues: result.error.issues };
}

export function createExtractionResult(
  raw: unknown,
  options?: { withTimestamp?: boolean }
): ValidationResult<ExtractionResult> {
  const base =
    typeof raw === "object" && raw !== null ? (raw as object) : ({} as object);

  const payload =
    options?.withTimestamp === false
      ? base
      : { ...base, timestamp: new Date().toISOString() };

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
