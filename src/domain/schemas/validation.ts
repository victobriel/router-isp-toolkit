import { z } from 'zod';

import {
  routerStateShape,
  topologySchema,
  wlanSsidExtractionEntrySchema,
} from '@/domain/schemas/router-state-schema';

export type ValidationIssue = z.ZodIssue;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

export const CredentialsSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const wlanExtractionConfigSchema = z.object({
  enabled: z.boolean(),
  channel: z.string(),
  mode: z.string(),
  bandWidth: z.string(),
  transmittingPower: z.string(),
});

const extractionRouterFields = routerStateShape({
  pppoeUsername: z.string(),
  ipVersion: z.string(),
  tr069Url: z.string(),
  wlan24GhzSsids: z.array(wlanSsidExtractionEntrySchema),
  wlan5GhzSsids: z.array(wlanSsidExtractionEntrySchema),
  dhcpIpAddress: z.string(),
  dhcpSubnetMask: z.string(),
  dhcpStartIp: z.string(),
  dhcpEndIp: z.string(),
  dhcpPrimaryDns: z.string(),
  dhcpSecondaryDns: z.string(),
  wlanConfig: wlanExtractionConfigSchema.partial(),
});

export const ExtractionResultSchema = z
  .object({
    ...extractionRouterFields,
    topology: topologySchema,
    routerModel: z.string(),
  })
  .partial();

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
  ip: z.string().optional(),
});

export const PingTestResultSchema = z.object({
  ip: z.string(),
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
