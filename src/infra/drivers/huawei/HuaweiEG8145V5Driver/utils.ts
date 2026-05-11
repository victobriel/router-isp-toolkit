import {
  HUAWEI_COLON_MAC,
  HUAWEI_IPV6_ADDRESS_MODE_LABEL,
  HUAWEI_USER_DEVICE_PARAM_ORDER,
} from '@/infra/drivers/huawei/HuaweiEG8145V5Driver/constants';
import { parseHuaweiWlanConfigurationIndex } from '@/infra/drivers/huawei/shared/utils';

export function huaweiIpv6AddressModeLabel(raw: string): string | undefined {
  const key = raw.trim().toUpperCase();
  return HUAWEI_IPV6_ADDRESS_MODE_LABEL[key];
}

export function normalizeMac(s: string): string {
  const t = s.replace(/-/g, ':').trim();
  if (HUAWEI_COLON_MAC.test(t)) return t.toLowerCase();
  const compact = t.replace(/:/g, '');
  if (compact.length === 12 && /^[0-9A-Fa-f]{12}$/i.test(compact)) {
    return compact
      .toLowerCase()
      .match(/.{1,2}/g)!
      .join(':');
  }
  return t.toLowerCase();
}

export function resolveWifiBandForUserDevice(
  row: Record<string, string>,
  byMac: Map<string, number>,
  byIp: Map<string, number>,
): '24ghz' | '5ghz' {
  const mac = normalizeMac(row.MacAddr ?? row.MACAddress ?? row.MacAddress ?? row.mac ?? '');
  const ip = (row.IpAddr ?? row.IPAddress ?? row.IPAddr ?? '').trim();
  let wlanIdx: number | null = null;
  if (mac && HUAWEI_COLON_MAC.test(mac)) {
    wlanIdx = byMac.get(mac.toLowerCase()) ?? null;
  }
  if (wlanIdx == null && ip) wlanIdx = byIp.get(ip) ?? null;
  if (wlanIdx == null) {
    wlanIdx = parseHuaweiWlanConfigurationIndex(row.Domain ?? row.domain ?? '');
  }
  if (wlanIdx != null && wlanIdx >= 5) return '5ghz';
  return '24ghz';
}

/**
 * When the ASP response is a POST/AJAX fragment, it may contain `new USERDevice("…")`
 * rows without `function USERDevice` — {@link HuaweiBaseDriver.parseHuaweiStructCallAll}
 * would return []. Parse arguments positionally instead.
 */
export function parseUserDeviceRowsPositional(raw: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  const re = /new\s+USERDevice\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const afterParen = match.index + match[0].length;
    const strings = scanUserDeviceCallStringArgs(raw, afterParen);
    if (strings == null || strings.length < 8) continue;
    const record: Record<string, string> = {};
    for (let i = 0; i < HUAWEI_USER_DEVICE_PARAM_ORDER.length && i < strings.length; i++) {
      record[HUAWEI_USER_DEVICE_PARAM_ORDER[i]] = strings[i];
    }
    records.push(record);
  }
  return records;
}

/** Reads comma-separated `null` / quoted string arguments until the closing `)`. */
export function scanUserDeviceCallStringArgs(raw: string, start: number): string[] | null {
  const strings: string[] = [];
  let pos = start;
  for (;;) {
    while (pos < raw.length && /\s/.test(raw[pos]!)) pos++;
    if (pos >= raw.length) return null;
    if (raw[pos] === ')') return strings;
    const atNull = raw.startsWith('null', pos) && !/[A-Za-z0-9_$]/.test(raw[pos + 4] ?? '');
    if (atNull) {
      strings.push('');
      pos += 4;
    } else if (raw[pos] === '"' || raw[pos] === "'") {
      const parsed = consumeJsStringLiteral(raw, pos);
      if (!parsed) return null;
      strings.push(parsed.value);
      pos = parsed.next;
    } else {
      return null;
    }
    while (pos < raw.length && /\s/.test(raw[pos]!)) pos++;
    if (pos < raw.length && raw[pos] === ',') {
      pos++;
      continue;
    }
    if (pos < raw.length && raw[pos] === ')') return strings;
    return null;
  }
}

export function consumeJsStringLiteral(
  raw: string,
  start: number,
): { value: string; next: number } | null {
  const q = raw[start];
  if (q !== '"' && q !== "'") return null;
  let pos = start + 1;
  let value = '';
  while (pos < raw.length) {
    const c = raw[pos]!;
    if (c === '\\') {
      pos++;
      if (pos >= raw.length) return null;
      const n = raw[pos]!;
      if (n === 'x' && pos + 2 < raw.length) {
        const hex = raw.slice(pos + 1, pos + 3);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) return null;
        value += String.fromCharCode(Number.parseInt(hex, 16));
        pos += 3;
      } else if (n === 'u' && pos + 4 < raw.length) {
        const hex = raw.slice(pos + 1, pos + 5);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
        value += String.fromCharCode(Number.parseInt(hex, 16));
        pos += 5;
      } else if (n === 'n') {
        value += '\n';
        pos++;
      } else if (n === 'r') {
        value += '\r';
        pos++;
      } else if (n === 't') {
        value += '\t';
        pos++;
      } else {
        value += n;
        pos++;
      }
    } else if (c === q) {
      return { value, next: pos + 1 };
    } else {
      value += c;
      pos++;
    }
  }
  return null;
}

export function tryReadHuaweiCsrfTokenFromDocument(): string | null {
  if (typeof document === 'undefined') return null;
  const selectors = ['#hwonttoken', '[name="onttoken"]'];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el instanceof HTMLInputElement && el.value.trim()) return el.value.trim();
  }
  return null;
}

/**
 * RFC 1918 private + loopback + link-local (and `0.0.0.0`). Hostnames are
 * deliberately treated as non-private because their resolution requires DNS,
 * which on Huawei ONTs only runs on the WAN side.
 */
export function isPrivateOrLocalIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host.trim());
  if (!m) return false;
  const [a, b] = [Number.parseInt(m[1]!, 10), Number.parseInt(m[2]!, 10)];
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  return false;
}

/** Decode a single `\…` escape starting at `src[i]` (which must be `\`). */
export function decodeJsEscape(src: string, i: number): string {
  const next = src[i + 1]!;
  if (next === 'x') {
    const hex = src.slice(i + 2, i + 4);
    if (!/^[0-9a-fA-F]{2}$/.test(hex)) return next;
    return String.fromCharCode(Number.parseInt(hex, 16));
  }
  if (next === 'u') {
    const hex = src.slice(i + 2, i + 6);
    if (!/^[0-9a-fA-F]{4}$/.test(hex)) return next;
    return String.fromCharCode(Number.parseInt(hex, 16));
  }
  switch (next) {
    case 'n':
      return '\n';
    case 'r':
      return '\r';
    case 't':
      return '\t';
    case 'b':
      return '\b';
    case 'f':
      return '\f';
    case 'v':
      return '\v';
    case '0':
      return '\0';
    default:
      return next;
  }
}

export async function fetchWithMethod(
  path: string,
  method: 'GET' | 'POST',
  body?: string,
): Promise<string | null> {
  try {
    const init: RequestInit = {
      method,
      credentials: 'include',
      cache: 'no-store',
    };
    if (method === 'POST') {
      init.headers = {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      };
      init.body = body ?? '';
    }
    const response = await fetch(path, init);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}
