import { IDomGateway } from '@/application/ports/IDomGateway';
import { ITopologySectionParser } from '../../shared/TopologySectionParser';
import { HuaweiBaseDriver } from '../shared/HuaweiBaseDriver';
import { HuaweiEG8145V5Selectors } from './HuaweiEG8145V5Selectors';
import { ButtonConfig } from '@/domain/ports/IRouter.types';
import { ExtractionResult, ExtractionResultSchema } from '@/domain/schemas/validation';
import { ExtractionFilter } from '@/application/types';
import {
  HUAWEI_INDEX_ENDPOINT,
  HUAWEI_TR069_ENDPOINT,
  HUAWEI_UPNP_ENDPOINT,
  HUAWEI_ACCESS_CONTROL_ENDPOINT,
  HUAWEI_WAN_ADDRESS_ACQUIRE_ENDPOINT,
  HUAWEI_WAN_LIST_ENDPOINT,
  HUAWEI_WAN_LIST_INFO_ENDPOINT,
  HUAWEI_WLAN24G_ADVANCED_ENDPOINT,
  HUAWEI_WLAN24G_ENDPOINT,
  HUAWEI_WLAN5G_ADVANCED_ENDPOINT,
  HUAWEI_WLAN5G_ENDPOINT,
  HUAWEI_OPTICAL_INFO_ENDPOINT,
  HUAWEI_GET_LAN_USER_DEV_INFO_ENDPOINT,
  HUAWEI_GET_LAN_USER_DHCP_INFO_ENDPOINT,
  HUAWEI_LAN_USER_INFO_ENDPOINT,
  HUAWEI_LAN_INFO_ENDPOINT,
  HUAWEI_IPV6_INFO_ENDPOINT,
} from '../shared/HuaweiCommonDriverConstants';
import type { TopologyClient } from '@/infra/drivers/shared/types';

/** Huawei `stWlanWifi` channel width / `X_HW_HT20` codes → display label */
const HUAWEI_WLAN_BANDWIDTH_LABELS: Partial<Record<string, string>> = {
  '0': 'Auto',
  '1': '20MHz',
  '2': '40MHz',
  '3': 'Auto',
};

/** Huawei `mode` / `X_HW_Standard` codes → display label */
const HUAWEI_WLAN_MODE_LABELS: Partial<Record<string, string>> = {
  '11b': '802.11b',
  '11g': '802.11g',
  '11bg': '802.11b/g',
  '11bgn': '802.11b/g/n',
  '11a': '802.11a',
  '11na': '802.11a/n',
  '11ac': '802.11a/n/ac',
};

const HUAWEI_WLAN_AUTHENTICATION_MODE_LABELS: Partial<Record<string, string>> = {
  Basic: 'Open',
  WPA: 'WPA',
  '11i': 'WPA2',
  WPAand11i: 'WPA/WPA2',
};

const HUAWEI_WLAN_ENCRYPTION_MODE_LABELS: Partial<Record<string, string>> = {
  AESEncryption: 'AES',
  TKIPEncryption: 'TKIP',
  TKIPandAESEncryption: 'TKIP&AES',
};

/**
 * Positional layout from `function USERDevice(Domain,IpAddr,MacAddr,…)` in
 * `GetLanUserDevInfo.asp` — used when the server returns `new USERDevice(…)`
 * rows without a constructor signature (typical of POST/AJAX snippets).
 */
const HUAWEI_USER_DEVICE_PARAM_ORDER = [
  'Domain',
  'IpAddr',
  'MacAddr',
  'Port',
  'IpType',
  'DevType',
  'DevStatus',
  'PortType',
  'Time',
  'HostName',
  'IPv4Enabled',
  'IPv6Enabled',
  'DeviceType',
  'UserDevAlias',
  'UserSpecifiedDeviceType',
  'LeaseTimeRemaining',
] as const;

/**
 * `opticinfo.asp` declares two `stOpticInfo` shapes (GPON vs RF ONT). Map the
 * `new stOpticInfo(...)` positional args after decoding — do not rely on
 * `parseHuaweiStructCall`, which would bind to the first `function stOpticInfo`
 * in the HTML and mis-align when the firmware uses the longer constructor.
 */
const HUAWEI_ST_OPTIC_INFO_KEYS_12 = [
  'domain',
  'LinkStatus',
  'transOpticPower',
  'revOpticPower',
  'voltage',
  'temperature',
  'bias',
  'rfRxPower',
  'rfOutputPower',
  'VendorName',
  'VendorSN',
] as const;

const HUAWEI_ST_OPTIC_INFO_KEYS_16 = [
  ...HUAWEI_ST_OPTIC_INFO_KEYS_12,
  'DateCode',
  'TxWaveLength',
  'RxWaveLength',
  'MaxTxDistance',
  'LosStatus',
] as const;

/** Same literal pattern as {@link HuaweiBaseDriver}'s `parseHuaweiStructCall`. */
const HUAWEI_JS_STRING_LITERAL = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;

/**
 * `wan.asp` IP acquisition radios — `value` on `#IPv6AddressMode1`…`4` → visible label
 * (`docs/wan-example.asp`).
 */
const HUAWEI_IPV6_ADDRESS_MODE_LABEL: Record<string, string> = {
  DHCPV6: 'DHCPv6',
  AUTOCONFIGURED: 'Automatic',
  STATIC: 'Static',
  NONE: 'None',
};

function huaweiIpv6AddressModeLabel(raw: string): string | undefined {
  const key = raw.trim().toUpperCase();
  return HUAWEI_IPV6_ADDRESS_MODE_LABEL[key];
}

export class HuaweiEG8145V5Driver extends HuaweiBaseDriver {
  constructor(topologyParser: ITopologySectionParser, domService: IDomGateway) {
    super('HUAWEI EG8145V5', HuaweiEG8145V5Selectors, topologyParser, domService);
  }

  public async extract(filter?: ExtractionFilter): Promise<ExtractionResult> {
    const extractors: Record<ExtractionFilter[number], () => Promise<Partial<ExtractionResult>>> = {
      opticalSignal: async () => this.getOpticalSignalState(),
      topology: async () => this.getTopologyState(),
      wan: async () => this.getWanState(),
      remoteAccess: async () => this.getRemoteAccessState(),
      wlan: async () => this.getWlanState(),
      lan: async () => this.getLanState(),
      upnp: async () => this.getUpnpState(),
      tr069: async () => this.getTr069State(),
      routerInfo: async () => this.getRouterInfoState(),
    };

    const keys = filter?.length ? filter : Object.keys(extractors);
    const data: Partial<ExtractionResult> = {};
    for (const key of keys) {
      const extractor = extractors[key as ExtractionFilter[number]];
      if (!extractor) continue;
      Object.assign(data, await extractor());
    }
    data.timestamp = new Date().toISOString();

    return ExtractionResultSchema.parse(data);
  }

  public buttonElementConfig(): ButtonConfig | null {
    return {
      targetSelector: '#logininfo',
      text: 'Run data extraction',
      style: `
        position: absolute;
        bottom: 6.5px;
        left: 27px;
        z-index: 10000;
        padding: 8px;
        color: white;
        border: none;
        cursor: pointer;
        background-color: transparent;
      `,
      extLogoStyle: `
        font-size: 9px;
        color: #FFFFFF90;
        margin-left: 4px;
      `,
    };
  }

  public override isAuthenticated(): boolean {
    const $homeTab = this.domService.getHTMLElement(this.s.homeTab, HTMLElement);
    const onLoginPage = this.isLoginPage();
    return !onLoginPage && !!$homeTab;
  }

  public override reboot(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  private async getOpticalSignalState(): Promise<Pick<ExtractionResult, 'opticalSignal'>> {
    const raw = await this.fetch(HUAWEI_OPTICAL_INFO_ENDPOINT);
    if (!raw) return { opticalSignal: undefined };

    const optic = this.parseStOpticInfo(raw);
    if (!optic) return { opticalSignal: undefined };

    const ontPonMode = this.matchHuaweiScriptVar(raw, 'ontPonMode');
    const summary = this.formatOpticalSignalSummary(optic, ontPonMode);
    return { opticalSignal: summary || undefined };
  }

  /**
   * Parses the first `new stOpticInfo('…', …)` row from `opticinfo.asp`
   * (`docs/opticinfo-example.asp`): TX/RX optical power, link state, optional
   * wavelengths (16-arg GPON form) or the shorter RF ONT form (12 args).
   */
  private parseStOpticInfo(raw: string): Record<string, string> | null {
    const call = /new\s+stOpticInfo\s*\(([\s\S]*?)\)/.exec(raw);
    if (!call) return null;

    const values = Array.from(call[1].matchAll(HUAWEI_JS_STRING_LITERAL), (m) =>
      this.unescapeHuaweiHex(m[1] ?? m[2]),
    );
    if (values.length < 12) return null;

    const keys = values.length >= 16 ? HUAWEI_ST_OPTIC_INFO_KEYS_16 : HUAWEI_ST_OPTIC_INFO_KEYS_12;
    const record: Record<string, string> = {};
    const len = Math.min(keys.length, values.length);
    for (let i = 0; i < len; i++) {
      record[keys[i]] = values[i];
    }
    return record;
  }

  /**
   * LAN topology mirrors `mainpage.asp`: scripts under `/html/bbsp/common/`
   * emit `new USERDevice(…)` rows. The live UI often loads that list via **POST**
   * (see `docs/huawei-iframe-scraping.md`); GET can be empty. POST bodies may
   * omit `function USERDevice`, so we fall back to positional parsing. Wi-Fi
   * band uses `stWifiWorkingMode` / `WLANConfiguration` index when present
   * (same rule as {@link getWlanState}).
   */
  private async getTopologyState(): Promise<Pick<ExtractionResult, 'topology'>> {
    const token = HuaweiEG8145V5Driver.tryReadHuaweiCsrfTokenFromDocument();
    const [devInfo, dhcpInfo, lanUserInfo] = await Promise.all([
      this.fetchLanUserAsp(HUAWEI_GET_LAN_USER_DEV_INFO_ENDPOINT, token),
      this.fetchLanUserAsp(HUAWEI_GET_LAN_USER_DHCP_INFO_ENDPOINT, token),
      this.fetchLanUserAsp(HUAWEI_LAN_USER_INFO_ENDPOINT, token),
    ]);
    const raw = [devInfo, dhcpInfo, lanUserInfo].filter((s): s is string => !!s).join('\n');
    if (!raw) return { topology: undefined };

    const topology = this.parseTopologyFromLanUserScripts(raw);
    return { topology: topology ?? undefined };
  }

  private parseTopologyFromLanUserScripts(raw: string): ExtractionResult['topology'] | null {
    const rows = this.collectUserDeviceRows(raw);
    if (rows.length === 0) return null;

    const { byMac, byIp } = this.buildWlanAssociationLookup(raw);

    const cable: TopologyClient[] = [];
    const clients24: TopologyClient[] = [];
    const clients5: TopologyClient[] = [];

    for (const row of rows) {
      const client = this.huaweiUserDeviceRowToTopologyClient(row);
      if (!client) continue;

      const portType = (row.PortType ?? row.portType ?? '').toUpperCase();
      if (portType === 'ETH') {
        cable.push(client);
      } else if (portType === 'WIFI') {
        const band = HuaweiEG8145V5Driver.resolveWifiBandForUserDevice(row, byMac, byIp);
        if (band === '5ghz') clients5.push(client);
        else clients24.push(client);
      }
    }

    if (cable.length === 0 && clients24.length === 0 && clients5.length === 0) return null;

    return {
      '24ghz': { clients: clients24, totalClients: clients24.length },
      '5ghz': { clients: clients5, totalClients: clients5.length },
      cable: { clients: cable, totalClients: cable.length },
    };
  }

  /**
   * Prefer IPv4 clients (`GetUserDevInfoList()` in `GetLanUserDevInfo.asp`). If that
   * yields nothing (fragment parsers or odd `IPv4Enabled`), keep all rows with a domain.
   */
  private collectUserDeviceRows(raw: string): Record<string, string>[] {
    const parsed = this.parseAllUserDeviceRows(raw);
    const ipv4 = this.dedupeUserDevicesByDomain(
      parsed,
      (row) => (row.IPv4Enabled ?? '').trim() === '1' && this.isUserDeviceOnline(row),
    );
    if (ipv4.length > 0) return ipv4;
    return this.dedupeUserDevicesByDomain(parsed, (row) => this.isUserDeviceOnline(row));
  }

  private isUserDeviceOnline(row: Record<string, string>): boolean {
    const status = (row.DevStatus ?? row.devStatus ?? row.Status ?? row.status ?? '').trim();
    if (!status) return true;
    return status.toUpperCase() === 'ONLINE';
  }

  private dedupeUserDevicesByDomain(
    rows: Record<string, string>[],
    keep: (row: Record<string, string>) => boolean,
  ): Record<string, string>[] {
    const byDomain = new Map<string, Record<string, string>>();
    for (const row of rows) {
      const domain = (row.Domain ?? '').trim();
      if (!domain || !keep(row)) continue;
      if (!byDomain.has(domain)) byDomain.set(domain, row);
    }
    return [...byDomain.values()];
  }

  private parseAllUserDeviceRows(raw: string): Record<string, string>[] {
    const fromSignature = this.parseHuaweiStructCallAll(raw, 'USERDevice');
    if (fromSignature.length > 0) return fromSignature;
    return HuaweiEG8145V5Driver.parseUserDeviceRowsPositional(raw);
  }

  private buildWlanAssociationLookup(raw: string): {
    byMac: Map<string, number>;
    byIp: Map<string, number>;
  } {
    const byMac = new Map<string, number>();
    const byIp = new Map<string, number>();
    const modes = this.parseHuaweiStructCallAll(raw, 'stWifiWorkingMode');
    for (const m of modes) {
      const domain = m.domain ?? m.Domain ?? '';
      const idx = HuaweiEG8145V5Driver.parseHuaweiWlanConfigurationIndex(domain);
      if (idx == null) continue;
      const macRaw = m.MacAddress ?? m.macAddress ?? '';
      const mac = HuaweiEG8145V5Driver.normalizeMac(macRaw);
      if (mac && HuaweiEG8145V5Driver.COLON_MAC.test(mac)) {
        byMac.set(mac.toLowerCase(), idx);
      }
      const ip = (m.IPAddress ?? m.IPAddr ?? m.ipAddress ?? '').trim();
      if (ip) byIp.set(ip, idx);
    }
    return { byMac, byIp };
  }

  private huaweiUserDeviceRowToTopologyClient(row: Record<string, string>): TopologyClient | null {
    const macRaw =
      row.MacAddr ??
      row.PhysAddress ??
      row.MACAddress ??
      row.MacAddress ??
      row.physAddress ??
      row.mac ??
      '';
    const mac = HuaweiEG8145V5Driver.normalizeMac(macRaw);
    if (!mac || !HuaweiEG8145V5Driver.COLON_MAC.test(mac)) return null;

    const ip =
      row.IpAddr?.trim() ||
      row.IPAddress?.trim() ||
      row.IPAddr?.trim() ||
      row.ipAddress?.trim() ||
      row.IP?.trim() ||
      row.ip?.trim() ||
      '';

    const host =
      row.HostName?.trim() ||
      row.hostname?.trim() ||
      row.UserDevAlias?.trim() ||
      row.Alias?.trim() ||
      row.DeviceName?.trim() ||
      row.DevName?.trim() ||
      '';

    const portType = (row.PortType ?? row.portType ?? '').toUpperCase();
    const rssiText =
      row.RSSI?.trim() ||
      row.Rssi?.trim() ||
      row.rssi?.trim() ||
      row.Signal?.trim() ||
      row.signal?.trim() ||
      '';
    let signal = 0;
    if (portType === 'WIFI' && rssiText) {
      const m = rssiText.match(/-?\d+/);
      if (m) signal = Number.parseInt(m[0], 10) || 0;
    }

    return {
      name: host || mac,
      ip,
      mac,
      signal,
    };
  }

  private static readonly COLON_MAC = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

  private static normalizeMac(s: string): string {
    const t = s.replace(/-/g, ':').trim();
    if (HuaweiEG8145V5Driver.COLON_MAC.test(t)) return t.toLowerCase();
    const compact = t.replace(/:/g, '');
    if (compact.length === 12 && /^[0-9A-Fa-f]{12}$/i.test(compact)) {
      return compact
        .toLowerCase()
        .match(/.{1,2}/g)!
        .join(':');
    }
    return t.toLowerCase();
  }

  /** Same index convention as {@link getWlanState} (`WLANConfiguration.N`). */
  private static parseHuaweiWlanConfigurationIndex(domain: string): number | null {
    const match = /\.WLANConfiguration\.(\d+)/.exec(domain);
    if (!match) return null;
    const index = Number.parseInt(match[1], 10);
    return Number.isNaN(index) ? null : index;
  }

  private static resolveWifiBandForUserDevice(
    row: Record<string, string>,
    byMac: Map<string, number>,
    byIp: Map<string, number>,
  ): '24ghz' | '5ghz' {
    const mac = HuaweiEG8145V5Driver.normalizeMac(
      row.MacAddr ?? row.MACAddress ?? row.MacAddress ?? row.mac ?? '',
    );
    const ip = (row.IpAddr ?? row.IPAddress ?? row.IPAddr ?? '').trim();
    let wlanIdx: number | null = null;
    if (mac && HuaweiEG8145V5Driver.COLON_MAC.test(mac)) {
      wlanIdx = byMac.get(mac.toLowerCase()) ?? null;
    }
    if (wlanIdx == null && ip) wlanIdx = byIp.get(ip) ?? null;
    if (wlanIdx == null) {
      wlanIdx = HuaweiEG8145V5Driver.parseHuaweiWlanConfigurationIndex(
        row.Domain ?? row.domain ?? '',
      );
    }
    if (wlanIdx != null && wlanIdx >= 5) return '5ghz';
    return '24ghz';
  }

  /**
   * When the ASP response is a POST/AJAX fragment, it may contain `new USERDevice("…")`
   * rows without `function USERDevice` — {@link HuaweiBaseDriver.parseHuaweiStructCallAll}
   * would return []. Parse arguments positionally instead.
   */
  private static parseUserDeviceRowsPositional(raw: string): Record<string, string>[] {
    const records: Record<string, string>[] = [];
    const re = /new\s+USERDevice\s*\(/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(raw)) !== null) {
      const afterParen = match.index + match[0].length;
      const strings = HuaweiEG8145V5Driver.scanUserDeviceCallStringArgs(raw, afterParen);
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
  private static scanUserDeviceCallStringArgs(raw: string, start: number): string[] | null {
    const strings: string[] = [];
    let pos = start;
    while (true) {
      while (pos < raw.length && /\s/.test(raw[pos]!)) pos++;
      if (pos >= raw.length) return null;
      if (raw[pos] === ')') return strings;
      const atNull = raw.startsWith('null', pos) && !/[A-Za-z0-9_$]/.test(raw[pos + 4] ?? '');
      if (atNull) {
        strings.push('');
        pos += 4;
      } else if (raw[pos] === '"' || raw[pos] === "'") {
        const parsed = HuaweiEG8145V5Driver.consumeJsStringLiteral(raw, pos);
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

  private static consumeJsStringLiteral(
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

  private static tryReadHuaweiCsrfTokenFromDocument(): string | null {
    if (typeof document === 'undefined') return null;
    const selectors = ['#hwonttoken', '[name="onttoken"]'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el instanceof HTMLInputElement && el.value.trim()) return el.value.trim();
    }
    return null;
  }

  private formatOpticalSignalSummary(
    o: Record<string, string>,
    _ontPonMode: string | null,
  ): string {
    const trim = (s: string | null | undefined) => (s ?? '').trim();

    const fmtPower = (v: string | undefined): string | null => {
      const t = trim(v);
      if (!t || t === '--') return null;
      return t.toLowerCase().includes('dbm') ? t : t;
    };

    // const tx = fmtPower(o.transOpticPower);
    const rx = fmtPower(o.revOpticPower);
    // const link = trim(o.LinkStatus);
    const parts: string[] = [];

    // const mode = trim(ontPonMode);
    // if (mode && mode.toLowerCase() !== 'auto') {
    //   parts.push(mode.toUpperCase());
    // }
    // if (link) {
    //   parts.push(link.toLowerCase() === 'ok' ? 'OK' : link);
    // }
    // if (tx) parts.push(`TX ${tx}`);
    // if (rx) parts.push(`RX ${rx}`);
    if (rx) parts.push(`${rx}`);

    // const txWl = trim(o.TxWaveLength);
    // const rxWl = trim(o.RxWaveLength);
    // if (txWl && rxWl && txWl !== '--' && rxWl !== '--') {
    //   parts.push(`${txWl}/${rxWl} nm`);
    // }

    return parts.join(' · ');
  }

  private async getWanState(): Promise<
    Pick<
      ExtractionResult,
      | 'internetEnabled'
      | 'pppoeUsername'
      | 'ipVersion'
      | 'ipAcquisitionMode'
      | 'requestPdEnabled'
      | 'slaacEnabled'
      | 'dhcpv6Enabled'
      | 'pdEnabled'
      | 'linkSpeed'
    >
  > {
    const undefinedResult = {
      internetEnabled: undefined,
      pppoeUsername: undefined,
      ipVersion: undefined,
      ipAcquisitionMode: undefined,
      requestPdEnabled: undefined,
      slaacEnabled: undefined,
      dhcpv6Enabled: undefined,
      pdEnabled: undefined,
      linkSpeed: undefined,
    };

    const [info, list, addressAcquire] = await Promise.all([
      this.fetch(HUAWEI_WAN_LIST_INFO_ENDPOINT),
      this.fetch(HUAWEI_WAN_LIST_ENDPOINT),
      this.fetch(HUAWEI_WAN_ADDRESS_ACQUIRE_ENDPOINT),
    ]);

    if (!info || !list) return undefinedResult;

    // wan_list.asp only contains the `new WanPPP(...)` / `new WanIP(...)` calls,
    // while wan_list_info.asp holds their constructor signatures. Concatenate so
    // the existing `parseHuaweiStructCall*` helpers find both in one buffer.
    const wanListBuffer = `${info}\n${list}`;

    const wanEntries: Array<{
      data: Record<string, string>;
      encapMode: 'PPPoE' | 'IPoE';
    }> = [
      ...this.parseHuaweiStructCallAll(wanListBuffer, 'WanPPP').map((data) => ({
        data,
        encapMode: 'PPPoE' as const,
      })),
      ...this.parseHuaweiStructCallAll(wanListBuffer, 'WanIP').map((data) => ({
        data,
        encapMode: 'IPoE' as const,
      })),
    ];

    if (wanEntries.length === 0) return undefinedResult;

    // Pick the routed INTERNET WAN — that is what wan.asp's form binds to when
    // the user selects the Internet entry. Fall back to any INTERNET WAN, then
    // to the first entry, mirroring how the firmware itself iterates WanList.
    const isInternet = (e: { data: Record<string, string> }) =>
      (e.data.ServiceList ?? '').toUpperCase().includes('INTERNET');
    const isRouted = (e: { data: Record<string, string> }) =>
      (e.data.Mode ?? '').toUpperCase().includes('ROUTED');

    const chosen =
      wanEntries.find((e) => isInternet(e) && isRouted(e)) ??
      wanEntries.find(isInternet) ??
      wanEntries[0];

    const { data, encapMode } = chosen;

    const internetEnabled = data.Enable === '1';

    const pppoeUsername =
      encapMode === 'PPPoE' ? (data.Username ? data.Username : undefined) : undefined;

    // Mirror GetProtocolType() in wan_list_info.asp.
    let ipVersion: string | undefined;
    if (data.IPv4Enable === '1' && data.IPv6Enable === '1') ipVersion = 'IPv4/IPv6';
    else if (data.IPv4Enable === '1') ipVersion = 'IPv4';
    else if (data.IPv6Enable === '1') ipVersion = 'IPv6';

    // LAN IPv6 — `lanaddress.asp`: `#AssignType1`/`#AssignType2` → `ManagedFlag`;
    // `#OtherType1`/`#OtherType2` → `OtherConfigFlag` (Other Information Assignment).
    let dhcpv6Enabled: boolean | undefined;
    let slaacEnabled: boolean | undefined;
    let pdEnabled: boolean | undefined;
    let requestPdEnabled: boolean | undefined;
    let ipAcquisitionMode: string | undefined;

    if (data.IPv6Enable !== '1') {
      dhcpv6Enabled = false;
      pdEnabled = false;
      requestPdEnabled = false;
    } else {
      const lanAddressRaw = await this.fetch(HUAWEI_IPV6_INFO_ENDPOINT);
      const raConfig = this.parseHuaweiStructCall(lanAddressRaw, 'RaConfigInfoClass');
      const managedFlag = raConfig?.ManagedFlag;
      if (managedFlag === '1' || managedFlag === '0') {
        slaacEnabled = managedFlag === '0';
      }
      const otherConfigFlag = raConfig?.OtherConfigFlag;
      if (otherConfigFlag === '1' || otherConfigFlag === '0') {
        dhcpv6Enabled = otherConfigFlag === '1';
      }

      let prefixItem: Record<string, string> | undefined;
      let addressItem: Record<string, string> | undefined;
      if (addressAcquire && data.domain) {
        const prefixItems = this.parseHuaweiStructCallAll(addressAcquire, 'PrefixAcquireItem');
        prefixItem = prefixItems.find(
          (item) => typeof item._domain === 'string' && item._domain.includes(data.domain),
        );
        const addressItems = [
          ...this.parseHuaweiStructCallAll(addressAcquire, 'IPAddressAcquireIPItem'),
          ...this.parseHuaweiStructCallAll(addressAcquire, 'IPAddressAcquirePPPItem'),
        ];
        addressItem = addressItems.find(
          (item) => typeof item._domain === 'string' && item._domain.includes(data.domain),
        );
        const prefixOrigin = (prefixItem?._Origin ?? '').toUpperCase();
        // PrefixAcquireItem coerces AutoConfigured / RouterAdvertisement to
        // PrefixDelegation, so they should also count as PD-enabled.
        pdEnabled =
          prefixOrigin === 'PREFIXDELEGATION' ||
          prefixOrigin === 'AUTOCONFIGURED' ||
          prefixOrigin === 'ROUTERADVERTISEMENT';
      }

      // wan.asp `#IPv6AddressMode1`…`4` — map `d.IPv6AddressMode` / acquire `_Origin` to UI labels.
      const ipv6AddressModeRaw =
        (data.IPv6AddressMode?.trim() || '') || (addressItem?._Origin?.trim() || '');
      if (ipv6AddressModeRaw !== '') {
        const label = huaweiIpv6AddressModeLabel(ipv6AddressModeRaw);
        if (label !== undefined) {
          ipAcquisitionMode = label;
        }
      }
      // wan.asp `#IPv6PrefixMode1` → `PrefixDelegation` / DHCPv6-PD (`wan_list` ← PrefixAcquireItem).
      const ipv6PrefixModeRaw =
        (data.IPv6PrefixMode?.trim() || '') || (prefixItem?._Origin?.trim() || '');
      if (ipv6PrefixModeRaw !== '') {
        const u = ipv6PrefixModeRaw.toUpperCase();
        requestPdEnabled = u === 'PREFIXDELEGATION' || u === 'DHCPV6-PD';
      }
    }

    return {
      internetEnabled,
      pppoeUsername,
      ipVersion,
      ipAcquisitionMode,
      requestPdEnabled,
      slaacEnabled,
      dhcpv6Enabled,
      pdEnabled,
      linkSpeed: undefined,
    };
  }

  private async getWlanState(): Promise<
    Pick<
      ExtractionResult,
      'wlan24GhzConfig' | 'wlan5GhzConfig' | 'wlan24GhzSsids' | 'wlan5GhzSsids'
    >
  > {
    const [wlanBasic2g, wlanBasic5g, wlanAdvance2g, wlanAdvance5g] = await Promise.all([
      this.fetch(HUAWEI_WLAN24G_ENDPOINT),
      this.fetch(HUAWEI_WLAN5G_ENDPOINT),
      this.fetch(HUAWEI_WLAN24G_ADVANCED_ENDPOINT),
      this.fetch(HUAWEI_WLAN5G_ADVANCED_ENDPOINT),
    ]);

    const allRaw = [wlanBasic2g, wlanBasic5g, wlanAdvance2g, wlanAdvance5g]
      .filter((raw): raw is string => !!raw)
      .join('\n');

    if (!allRaw) {
      return {
        wlan24GhzConfig: undefined,
        wlan5GhzConfig: undefined,
        wlan24GhzSsids: undefined,
        wlan5GhzSsids: undefined,
      };
    }

    const parseWlanIndex = (domain: string | undefined): number | null => {
      if (!domain) return null;
      const match = /\.WLANConfiguration\.(\d+)/.exec(domain);
      if (!match) return null;
      const index = Number.parseInt(match[1], 10);
      return Number.isNaN(index) ? null : index;
    };

    const is2gIndex = (index: number | null): boolean => index != null && index <= 4;
    const is5gIndex = (index: number | null): boolean => index != null && index >= 5;

    const wlanWifiRows = [
      ...this.parseHuaweiStructCallAll(allRaw, 'stWlanWifi').map((row) => {
        const domain = row.domain ?? row.Domain;
        const bandWidth = row.channelWidth ?? row.X_HW_HT20;
        const bandWidthKey =
          bandWidth !== undefined && bandWidth !== null && bandWidth !== ''
            ? String(bandWidth)
            : undefined;
        const bandWidthLabel = bandWidthKey
          ? HUAWEI_WLAN_BANDWIDTH_LABELS[bandWidthKey]
          : undefined;

        const mode = row.mode ?? row.X_HW_Standard;
        const modeKey =
          mode !== undefined && mode !== null && mode !== '' ? String(mode) : undefined;
        const modeLabel = modeKey ? HUAWEI_WLAN_MODE_LABELS[modeKey] : undefined;

        return {
          domain,
          index: parseWlanIndex(domain),
          enabled: row.enable ?? row.Enable,
          mode: modeLabel,
          channel: row.channel ?? row.Channel,
          transmittingPower: `${row.power ?? row.TransmitPower}%`,
          bandWidth: bandWidthLabel,
        };
      }),
    ];

    const wlanRows = this.parseHuaweiStructCallAll(allRaw, 'stWlan').map((row) => {
      const domain = row.domain ?? row.Domain;
      const authenticationMode = row.BeaconType;
      const encryptionMode = row.X_HW_WPAand11iEncryptionModes;

      const authModeLabel = authenticationMode
        ? HUAWEI_WLAN_AUTHENTICATION_MODE_LABELS[authenticationMode]
        : undefined;
      const encryptModeLabel = encryptionMode
        ? HUAWEI_WLAN_ENCRYPTION_MODE_LABELS[encryptionMode]
        : undefined;

      return {
        domain,
        index: parseWlanIndex(domain),
        enabled: row.enable ?? row.Enable,
        ssid: row.ssid ?? row.SSID,
        ssidHideMode: !row.wlHide,
        wpa2SecurityType: [authModeLabel, encryptModeLabel].filter(Boolean).join('-'),
        maxClients: row.DeviceNum,
      };
    });

    const preSharedRows = this.parseHuaweiStructCallAll(allRaw, 'stPreSharedKey').map((row) => ({
      domain: row.domain,
      password: row.psk || row.kpp || '',
    }));

    const findBandConfig = (isBandIndex: (idx: number | null) => boolean) => {
      const row = wlanWifiRows.find((item) => isBandIndex(item.index));
      if (!row) return undefined;
      return {
        enabled: row.enabled === '1',
        channel: row.channel || undefined,
        mode: row.mode || undefined,
        bandWidth: row.bandWidth || undefined,
        transmittingPower: row.transmittingPower || undefined,
      };
    };

    const buildSsids = (isBandIndex: (idx: number | null) => boolean) => {
      const bandRows = wlanRows.filter((row) => isBandIndex(row.index));
      if (!bandRows.length) return undefined;
      return bandRows.map((row) => {
        const password =
          preSharedRows.find((key) => key.domain?.includes(row.domain || ''))?.password ||
          undefined;
        const maxClients = Number.parseInt(row.maxClients ?? '', 10);
        return {
          enabled: row.enabled === '1',
          ssidName: row.ssid || undefined,
          ssidPassword: password,
          ssidHideMode: row.ssidHideMode,
          wpa2SecurityType: row.wpa2SecurityType || undefined,
          maxClients: Number.isNaN(maxClients) ? undefined : maxClients,
        };
      });
    };

    return {
      wlan24GhzConfig: findBandConfig(is2gIndex),
      wlan5GhzConfig: findBandConfig(is5gIndex),
      wlan24GhzSsids: buildSsids(is2gIndex),
      wlan5GhzSsids: buildSsids(is5gIndex),
    };
  }

  private async getRemoteAccessState(): Promise<
    Pick<ExtractionResult, 'remoteAccessIpv4Enabled' | 'remoteAccessIpv6Enabled'>
  > {
    const raw = await this.fetch(HUAWEI_ACCESS_CONTROL_ENDPOINT);
    if (!raw) {
      return { remoteAccessIpv4Enabled: undefined, remoteAccessIpv6Enabled: undefined };
    }

    const masterToggle = this.parseHuaweiStructCall(raw, 'stNewAclEnable');
    const aclEnabled = masterToggle?.enable === '1';

    const hasHttpRule = this.parseHuaweiStructCallAll(raw, 'stNewDeviceAcl').some((rule) =>
      rule.Protocol.toUpperCase()
        .split(',')
        .map((p) => p.trim())
        .includes('HTTP'),
    );

    return {
      remoteAccessIpv4Enabled: aclEnabled && hasHttpRule,
      remoteAccessIpv6Enabled: undefined,
    };
  }

  private async getLanState(): Promise<
    Pick<
      ExtractionResult,
      | 'dhcpEnabled'
      | 'dhcpRelayStatus'
      | 'dhcpIpAddress'
      | 'dhcpSubnetMask'
      | 'dhcpStartIp'
      | 'dhcpEndIp'
      | 'dhcpPrimaryDns'
      | 'dhcpSecondaryDns'
      | 'dhcpLeaseTimeMode'
    >
  > {
    const raw = await this.fetch(HUAWEI_LAN_INFO_ENDPOINT);
    if (!raw) {
      return {
        dhcpEnabled: undefined,
        dhcpRelayStatus: undefined,
        dhcpIpAddress: undefined,
        dhcpSubnetMask: undefined,
        dhcpStartIp: undefined,
        dhcpEndIp: undefined,
        dhcpPrimaryDns: undefined,
        dhcpSecondaryDns: undefined,
        dhcpLeaseTimeMode: undefined,
      };
    }

    const lanHostInfo = this.parseHuaweiStructCallAll(raw, 'stipaddr').find((row) =>
      row.domain?.includes('.IPInterface.1'),
    );
    const dhcpMain = this.parseHuaweiStructCallAll(raw, 'dhcpmainst')[0];

    const parseLeaseTimeMode = (leaseTimeRaw: string | undefined): string | undefined => {
      const leaseTime = Number.parseInt((leaseTimeRaw ?? '').trim(), 10);
      if (!Number.isFinite(leaseTime) || leaseTime <= 0) return undefined;
      // if (leaseTime === -1 || leaseTime === 4294967295) return 'Infinite';
      // if (leaseTime % 604800 === 0) return 'Week';
      // if (leaseTime % 86400 === 0) return 'Day';
      // if (leaseTime % 3600 === 0) return 'Hour';
      // if (leaseTime % 60 === 0) return 'Minute';
      // return undefined;
      return leaseTime.toString();
    };

    const parseDns = (
      primaryRaw: string | undefined,
      secondaryRaw: string | undefined,
      mergedRaw: string | undefined,
    ): { primary: string | undefined; secondary: string | undefined } => {
      const merged = (mergedRaw ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      const primary = (primaryRaw ?? '').trim() || merged[0];
      const secondary = (secondaryRaw ?? '').trim() || merged[1];
      return {
        primary: primary || undefined,
        secondary: secondary || undefined,
      };
    };

    const dns = parseDns(
      dhcpMain?.MainPriDNS,
      dhcpMain?.MainSecDNS,
      dhcpMain?.MainDNS ?? dhcpMain?.DNSServers,
    );

    return {
      dhcpEnabled: dhcpMain?.enable === '1',
      dhcpRelayStatus: dhcpMain?.l2relayenable === '1',
      dhcpIpAddress: lanHostInfo?.ipaddr?.trim() || undefined,
      dhcpSubnetMask: lanHostInfo?.subnetmask?.trim() || undefined,
      dhcpStartIp: dhcpMain?.startip?.trim() || undefined,
      dhcpEndIp: dhcpMain?.endip?.trim() || undefined,
      dhcpPrimaryDns: dns.primary,
      dhcpSecondaryDns: dns.secondary,
      dhcpLeaseTimeMode: parseLeaseTimeMode(dhcpMain?.leasetime),
    };
  }

  private async getUpnpState(): Promise<Pick<ExtractionResult, 'upnpEnabled'>> {
    const raw = await this.fetch(HUAWEI_UPNP_ENDPOINT);
    if (!raw) return { upnpEnabled: undefined };
    const main = this.matchHuaweiScriptVar(raw, 'enblMainUpnp');
    const slave = this.matchHuaweiScriptVar(raw, 'enblSlvUpnp');
    if (main == null || slave == null) return { upnpEnabled: undefined };
    return { upnpEnabled: main === '1' && slave === '1' };
  }

  private async getTr069State(): Promise<Pick<ExtractionResult, 'tr069Url' | 'tr069Enabled'>> {
    const raw = await this.fetch(HUAWEI_TR069_ENDPOINT);
    const cwmp = this.parseHuaweiCwmp(raw);
    if (!cwmp) return { tr069Url: undefined, tr069Enabled: undefined };
    return {
      tr069Url: cwmp.URL ? cwmp.URL : undefined,
      tr069Enabled: cwmp.EnableCWMP === '1',
    };
  }

  private async getRouterInfoState(): Promise<
    Pick<ExtractionResult, 'routerModel' | 'routerVersion'>
  > {
    const raw = await this.fetch(HUAWEI_INDEX_ENDPOINT);
    if (!raw) return { routerModel: undefined, routerVersion: undefined };
    const productName = this.matchHuaweiScriptVar(raw, 'ProductName');
    return {
      routerModel: productName ?? undefined,
      routerVersion: undefined,
    };
  }

  private async fetch(path: string): Promise<string | null> {
    try {
      const response = await fetch(path, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }

  /** Prefer POST (matches live `GetLanUserDevInfo.asp` usage); fall back to GET. */
  private async fetchLanUserAsp(path: string, csrfToken: string | null): Promise<string | null> {
    const postBody = csrfToken ? `x.X_HW_Token=${encodeURIComponent(csrfToken)}` : '';
    const post = await HuaweiEG8145V5Driver.fetchWithMethod(path, 'POST', postBody);
    if (post && /new\s+USERDevice\s*\(/i.test(post)) return post;
    const get = await HuaweiEG8145V5Driver.fetchWithMethod(path, 'GET');
    if (get && /new\s+USERDevice\s*\(/i.test(get)) return get;
    return post ?? get;
  }

  private static async fetchWithMethod(
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
}
