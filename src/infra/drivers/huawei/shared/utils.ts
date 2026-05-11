import { REGEX_META } from '@/infra/drivers/huawei/shared/constants';

export function escapeRegExp(s: string): string {
  return s.replace(REGEX_META, '\\$&');
}

export function extractIdsFromCommaSelector(selector: string): string[] {
  return selector
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('#'))
    .map((part) => part.slice(1));
}

/**
 * Huawei ASP/HTML often encodes non-ASCII as `\xNN` inside attribute strings.
 */
export function unescapeHuaweiHex(value: string): string {
  return value.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

/**
 * Parse `InternetGatewayDevice...WLANConfiguration.N` instance index from TR-069 domain strings.
 */
export function parseHuaweiWlanConfigurationIndex(domain: string): number | null {
  const match = /\.WLANConfiguration\.(\d+)/.exec(domain);
  if (!match) return null;
  const index = Number.parseInt(match[1], 10);
  return Number.isNaN(index) ? null : index;
}
