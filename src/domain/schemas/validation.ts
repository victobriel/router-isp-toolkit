import { z } from "zod";

export const CredentialsSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const ExtractionResultSchema = z.object({
  timestamp: z.string().optional(),
  pppoeUsername: z.string().optional(),
  internetStatus: z.boolean().optional(),
  tr069Status: z.boolean().optional(),
  ipVersion: z.string().nullable().optional(),
  requestPdStatus: z.boolean().optional(),
  slaacStatus: z.boolean().optional(),
  dhcpv6Status: z.boolean().optional(),
  pdStatus: z.boolean().optional(),
  linkSpeed: z.string().optional(),
  remoteAccessIpv4Status: z.boolean().optional(),
  remoteAccessIpv6Status: z.boolean().optional(),
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

export interface ButtonConfig {
  targetSelector: string;
  text: string;
  style: string;
}
