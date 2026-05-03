import { IDomGateway } from '@/application/ports/IDomGateway';
import { ITopologySectionParser } from '../../shared/TopologySectionParser';
import { HuaweiBaseDriver } from '../shared/HuaweiBaseDriver';
import { HuaweiEG8145V5Selectors } from './HuaweiEG8145V5Selectors';
import { ButtonConfig } from '@/domain/ports/IRouter.types';
import {
  ExtractionResult,
  ExtractionResultSchema,
  PingTestResult,
} from '@/domain/schemas/validation';
import { ExtractionFilter, RouterPage, RouterPageKey } from '@/application/types';
import { TopologyBand, TopologyClient } from '../../shared/types';

/**
 * Endpoint used by the Huawei web UI (e.g. EG8145V5, K562e) to populate the
 * topology / connected-devices section. Returns a JavaScript file declaring a
 * `UserDevinfo` array of `new USERDevice(...)` calls. Same-origin only — the
 * session cookie must be forwarded via `credentials: 'include'`.
 */
const HUAWEI_USER_DEVICE_INFO_ENDPOINT = '/html/bbsp/common/GetLanUserDevInfo.asp';

/**
 * Constructor signature in the firmware's JS:
 *   new USERDevice(Domain, IpAddr, MacAddr, Port, IpType, DevType,
 *                  DevStatus, PortType, Time, HostName)
 * String literals may contain `\xNN` hex escapes (e.g. ":" → "\x3a").
 */
const HUAWEI_USER_DEVICE_PATTERN =
  /new\s+USERDevice\s*\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)/g;

/** Huawei convention: SSID1..SSID4 → 2.4GHz, SSID5..SSID8 → 5GHz. */
const HUAWEI_SSID_24GHZ_MAX = 4;
const HUAWEI_SSID_5GHZ_MAX = 8;
const HUAWEI_WLAN_BASIC_ENDPOINTS = [
  '/html/amp/wlanbasic/WlanBasic.asp?2G',
  '/html/amp/wlanbasic/WlanBasic.asp?5G',
];
const HUAWEI_UPNP_ENDPOINT = '/html/bbsp/upnp/upnp.asp';
const HUAWEI_DEVICE_INFO_ENDPOINT = '/html/ssmp/deviceinfo/deviceinfo.asp';
const HUAWEI_DIAGNOSE_ENDPOINT = '/html/bbsp/maintenance/diagnosecommon.asp';
const HUAWEI_WAN_ENDPOINTS = ['/html/bbsp/wan/wan.asp', '/html/bbsp/waninfo/waninfo.asp'];
/** WAN instance data for `wan.asp` (`GetWanList()`); PPPoE username is not in the static `#UserName` input. */
const HUAWEI_WAN_LIST_ASP = '/html/bbsp/common/wan_list.asp';

/** Shared with `matchHuaweiWanIpVersionFromFirmwareScripts` and WAN ipVersion diagnostics. */
const HUAWEI_WAN_IP_VERSION_SCRIPT_PATTERNS: ReadonlyArray<{ id: string; re: RegExp }> = [
  { id: 'd.ProtocolType=', re: /\bd\.ProtocolType\s*=\s*["']([^"']+)["']/i },
  { id: 'ProtocolType:', re: /\bProtocolType\s*:\s*["']([^"']+)["']/i },
  { id: '"ProtocolType":', re: /["']ProtocolType["']\s*:\s*["']([^"']+)["']/i },
  { id: '["ProtocolType"]=', re: /\["']ProtocolType["']\]\s*=\s*["']([^"']+)["']/i },
  { id: 'jQuery#ProtocolType.val', re: /\$\(\s*["']#ProtocolType["']\s*\)\.val\(\s*["']([^"']+)["']\s*\)/i },
  { id: '(ProtocolType,', re: /\(\s*["']ProtocolType["']\s*,\s*["']([^"']+)["']/i },
];

export interface HuaweiWanIpVersionFetchMeta {
  path: string;
  ok: boolean;
  status: number;
  redirected: boolean;
  length: number;
  error: string | null;
  /** Heuristic: body suggests login / session page rather than WAN config. */
  looksLikeAuthShell: boolean;
  hasSubstringProtocolType: boolean;
  hasSelectIdProtocolType: boolean;
  hasSelectNameProtocolType: boolean;
  snippetNearProtocolType: string | null;
  /** Collapsed head of body for quick eyeballing (no secrets targeted; may still contain user data). */
  bodyHead: string | null;
}

export interface HuaweiWanIpVersionScriptProbe {
  patternId: string;
  matched: boolean;
  /** Raw first capture group before validation. */
  capture: string | null;
  acceptedAsIpVersion: boolean;
}

export interface HuaweiWanIpVersionDiagnostics {
  capturedAtIso: string;
  resolvedIpVersion: string | undefined;
  resolutionSteps: ReadonlyArray<{ step: string; value: string | null }>;
  wanEndpointFetches: HuaweiWanIpVersionFetchMeta[];
  wanListFetch: HuaweiWanIpVersionFetchMeta;
  mergedWanUsedForParsing: {
    length: number;
    selectInnerFound: boolean;
    selectInnerLength: number | null;
    optionTagCount: number;
    anyOptionHasSelectedAttr: boolean;
    firstOptionOpenTagPreview: string | null;
    firstResolvedValue: string | null;
    firstResolvedText: string | null;
  };
  scriptProbesOnWanList: HuaweiWanIpVersionScriptProbe[];
  scriptProbesOnMergedWan: HuaweiWanIpVersionScriptProbe[];
  hints: string[];
}
const HUAWEI_LAN_ENDPOINTS = [
  '/html/bbsp/dhcpserver/dhcpserver.asp',
  '/html/bbsp/layer3/lanhostcfg.asp',
  '/html/bbsp/lanhost/lanhost.asp',
  '/html/bbsp/lanaddress/lanaddress.asp',
];
const HUAWEI_TR069_ENDPOINTS = [
  '/html/ssmp/tr069/tr069.asp',
  '/html/ssmp/tr069config/tr069.asp',
  '/html/ssmp/accoutcfg/tr069.asp',
];

interface ParsedHuaweiUserDevice {
  ipAddr: string;
  macAddr: string;
  port: string;
  status: string;
  portType: string;
  hostName: string;
}

export class HuaweiEG8145V5Driver extends HuaweiBaseDriver {
  /**
   * When true, WAN extraction records rich `#ProtocolType` / ipVersion diagnostics and logs with `console.debug`.
   * Read `lastWanIpVersionDiagnostics` or call `getWanIpVersionDebugSnapshot()` after a WAN extract.
   */
  public static wanIpVersionDebug = false;

  public static lastWanIpVersionDiagnostics: HuaweiWanIpVersionDiagnostics | null = null;

  public static setWanIpVersionDebug(enabled: boolean): void {
    HuaweiEG8145V5Driver.wanIpVersionDebug = enabled;
  }

  public static getWanIpVersionDebugSnapshot(): HuaweiWanIpVersionDiagnostics | null {
    return HuaweiEG8145V5Driver.lastWanIpVersionDiagnostics;
  }

  constructor(topologyParser: ITopologySectionParser, domService: IDomGateway) {
    super('HUAWEI EG8145V5', HuaweiEG8145V5Selectors, topologyParser, domService);
  }

  public async extract(filter?: ExtractionFilter): Promise<ExtractionResult> {
    const extractors: Record<ExtractionFilter[number], () => Promise<Partial<ExtractionResult>>> = {
      topology: () => this.extractTopologyData(),
      wan: async () => {
        const linkSpeedData = await this.extractLinkSpeedData();
        const wanData = await this.extractWanData();
        return { ...wanData, ...linkSpeedData };
      },
      remoteAccess: () => this.extractRemoteAccessData(),
      wlan: async () => {
        const wlanData = await this.extractWlanData();
        const bandSteeringData = await this.extractBandSteeringData();
        return { ...wlanData, ...bandSteeringData };
      },
      lan: () => this.extractLanData(),
      upnp: () => this.extractUpnpData(),
      routerInfo: () => this.extractRouterVersionData(),
      tr069: () => this.extractTr069UrlData(),
    };

    const keys = filter?.length ? filter : Object.keys(extractors);
    const data: Partial<ExtractionResult> = {};
    for (const key of keys) {
      const extractor = extractors[key as ExtractionFilter[number]];
      if (!extractor) continue;
      Object.assign(data, await extractor());
    }
    data.timestamp = new Date().toISOString();
    data.goToHomePage = this.goToHomePage();

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

  public override ping(ip: string): Promise<PingTestResult | null> {
    throw new Error('Method not implemented.');
  }

  public override reboot(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  public override goToPage(page: RouterPage, key: RouterPageKey): void {
    throw new Error('Method not implemented.');
  }

  protected async extractTopologyData(): Promise<Pick<ExtractionResult, 'topology'>> {
    const grouped: Record<TopologyBand, TopologyClient[]> = {
      '24ghz': [],
      '5ghz': [],
      cable: [],
    };

    const raw = await this.fetchHuaweiUserDeviceInfo();
    if (raw) {
      for (const dev of this.parseHuaweiUserDevices(raw)) {
        if (dev.status.toUpperCase() !== 'ONLINE') continue;

        const band = this.classifyHuaweiTopologyBand(dev.portType, dev.port);
        if (!band) continue;

        grouped[band].push({
          name: dev.hostName || dev.macAddr,
          ip: dev.ipAddr,
          mac: dev.macAddr,
          // GetLanUserDevInfo.asp does not expose per-device RSSI; use 0 as
          // the schema-required placeholder (matches drivers that only have
          // wired clients).
          signal: 0,
        });
      }
    }

    return {
      topology: {
        '24ghz': { clients: grouped['24ghz'], totalClients: grouped['24ghz'].length },
        '5ghz': { clients: grouped['5ghz'], totalClients: grouped['5ghz'].length },
        cable: { clients: grouped.cable, totalClients: grouped.cable.length },
      },
    };
  }

  private async fetchHuaweiUserDeviceInfo(): Promise<string | null> {
    try {
      const response = await fetch(HUAWEI_USER_DEVICE_INFO_ENDPOINT, {
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

  private *parseHuaweiUserDevices(raw: string): Generator<ParsedHuaweiUserDevice> {
    HUAWEI_USER_DEVICE_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = HUAWEI_USER_DEVICE_PATTERN.exec(raw)) !== null) {
      yield {
        ipAddr: this.unescapeHuaweiHex(match[2]),
        macAddr: this.unescapeHuaweiHex(match[3]),
        port: match[4],
        status: match[7],
        portType: match[8],
        hostName: this.unescapeHuaweiHex(match[10]),
      };
    }
  }

  private classifyHuaweiTopologyBand(portType: string, port: string): TopologyBand | null {
    const upperType = portType.toUpperCase();
    if (upperType === 'ETH') return 'cable';
    if (upperType !== 'WIFI') return null;

    const ssidMatch = port.match(/SSID(\d+)/i);
    if (!ssidMatch) return null;

    const idx = Number.parseInt(ssidMatch[1], 10);
    if (!Number.isFinite(idx)) return null;
    if (idx >= 1 && idx <= HUAWEI_SSID_24GHZ_MAX) return '24ghz';
    if (idx > HUAWEI_SSID_24GHZ_MAX && idx <= HUAWEI_SSID_5GHZ_MAX) return '5ghz';
    return null;
  }

  // TODO: Implement this
  protected async extractBandSteeringData(): Promise<
    Pick<ExtractionResult, 'bandSteeringEnabled'>
  > {
    return { bandSteeringEnabled: undefined };
  }

  private async extractWanData(): Promise<
    Pick<
      ExtractionResult,
      | 'internetEnabled'
      | 'tr069Enabled'
      | 'pppoeUsername'
      | 'ipVersion'
      | 'requestPdEnabled'
      | 'slaacEnabled'
      | 'dhcpv6Enabled'
      | 'pdEnabled'
    >
  > {
    const wanRaw = await this.fetchHuaweiWanPagesMerged();
    const wanListRaw = await this.fetchHuaweiWanListAsp();
    const diagnoseRaw = await this.fetchHuaweiPage(HUAWEI_DIAGNOSE_ENDPOINT);

    const internetEnabled = this.matchCheckedBySelector(wanRaw, this.s.advWanEnable);
    const pppoeFromInput = this.matchInputValueBySelector(wanRaw, this.s.advPppoeUsername);
    const pppoeUsername =
      (pppoeFromInput?.trim() ? pppoeFromInput : null) ??
      this.matchPppoeFromHuaweiWanPppConstructors(wanListRaw) ??
      this.matchPppoeFromHuaweiWanInfoInstInternetPppoe(wanListRaw);
    const ipVersion =
      this.matchSelectSelectedValueBySelector(wanRaw, '#ProtocolType') ??
      this.matchSelectSelectedTextBySelector(wanRaw, '#ProtocolType') ??
      this.matchHuaweiWanIpVersionFromFirmwareScripts(wanListRaw) ??
      this.matchHuaweiWanIpVersionFromFirmwareScripts(wanRaw);

    if (HuaweiEG8145V5Driver.wanIpVersionDebug) {
      const diag = await this.buildWanIpVersionDiagnostics(wanRaw, wanListRaw, ipVersion ?? undefined);
      HuaweiEG8145V5Driver.lastWanIpVersionDiagnostics = diag;
      console.debug('[Huawei EG8145V5] WAN ipVersion diagnostics', diag);
    } else {
      HuaweiEG8145V5Driver.lastWanIpVersionDiagnostics = null;
    }

    const hasIpv6AddressModeRadios = /name=["']IPv6AddressMode["']/i.test(wanRaw ?? '');
    const ipv6Acquisition = this.matchHuaweiWanIpv6AddressAcquisition(wanRaw);
    const legacyDhcpv6Checkbox = hasIpv6AddressModeRadios
      ? null
      : this.matchCheckedBySelector(wanRaw, this.s.advDhcpv6Enable);
    const dhcpv6Enabled =
      ipv6Acquisition?.dhcpv6Enabled ??
      (legacyDhcpv6Checkbox == null ? undefined : legacyDhcpv6Checkbox);
    const slaacEnabled =
      ipv6Acquisition?.slaacEnabled ??
      (legacyDhcpv6Checkbox == null ? undefined : !legacyDhcpv6Checkbox);

    const pdFlags = this.matchHuaweiWanPrefixDelegationFlags(wanRaw);
    const legacyPd = this.matchCheckedBySelector(wanRaw, this.s.advPdEnable);
    const requestPdEnabled = pdFlags?.requestPdEnabled ?? legacyPd ?? undefined;
    const pdEnabled = pdFlags?.pdEnabled ?? legacyPd ?? undefined;

    const tr069EnabledRaw = this.matchQuotedVar(diagnoseRaw, 'Tr069Enable');

    return {
      internetEnabled: internetEnabled ?? undefined,
      tr069Enabled:
        tr069EnabledRaw == null
          ? undefined
          : tr069EnabledRaw === '1' || tr069EnabledRaw.toLowerCase() === 'true',
      pppoeUsername: pppoeUsername ?? undefined,
      ipVersion: ipVersion ?? undefined,
      requestPdEnabled,
      slaacEnabled,
      dhcpv6Enabled,
      pdEnabled,
    };
  }

  /**
   * Reads the checked WAN IPv6 "IP Acquisition Mode" radio group (`name="IPv6AddressMode"`).
   * HTML uses ids IPv6AddressMode1..4, not a single `#IPv6AddressMode` control.
   */
  private matchHuaweiWanIpv6AddressAcquisition(
    wanRaw: string | null,
  ): { dhcpv6Enabled: boolean; slaacEnabled: boolean } | null {
    const mode = this.matchCheckedInputValueByName(wanRaw, 'IPv6AddressMode');
    if (mode == null) return null;
    switch (mode) {
      case 'DHCPv6':
        return { dhcpv6Enabled: true, slaacEnabled: false };
      case 'AutoConfigured':
        // RFC4861-style stateless + optional DHCPv6; treat as both address mechanisms enabled for UI parity.
        return { dhcpv6Enabled: true, slaacEnabled: true };
      case 'Static':
      case 'None':
        return { dhcpv6Enabled: false, slaacEnabled: false };
      default:
        return null;
    }
  }

  /**
   * Prefix delegation: checkbox `PrifixEnabled` (firmware spelling) and/or prefix mode radios `IPv6PrefixMode*`.
   */
  private matchHuaweiWanPrefixDelegationFlags(
    wanRaw: string | null,
  ): { pdEnabled: boolean; requestPdEnabled: boolean } | null {
    const prifix = this.matchCheckedById(wanRaw, 'PrifixEnabled');
    const prefixMode = this.matchCheckedInputValueByName(wanRaw, 'IPv6PrefixMode');
    const legacyOnlyPdRadio = this.matchCheckedById(wanRaw, 'IPv6PrefixMode1');
    const fromPrefixMode = prefixMode === 'PrefixDelegation';

    const hasPrifixControl = prifix !== null;
    const hasPrefixModeGroup = prefixMode !== null;
    let active: boolean | null = null;
    if (hasPrifixControl) {
      active = prifix || fromPrefixMode;
    } else if (hasPrefixModeGroup) {
      active = fromPrefixMode;
    } else if (legacyOnlyPdRadio !== null) {
      active = legacyOnlyPdRadio;
    }
    if (active === null) return null;
    return { pdEnabled: active, requestPdEnabled: active };
  }

  /** Value of the checked `<input name="...">` in order of appearance (Huawei WAN form radio lists). */
  private matchCheckedInputValueByName(raw: string | null, name: string): string | null {
    if (!raw) return null;
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`<input[^>]*name=["']${escapedName}["'][^>]*>`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
      const tag = m[0];
      if (/<input\b[^>]*\bchecked\b/i.test(tag)) {
        const vm = /value=["']([^"']*)["']/i.exec(tag);
        return vm ? this.unescapeHuaweiHex(vm[1]) : null;
      }
    }
    return null;
  }

  private async fetchHuaweiWanListAsp(): Promise<string | null> {
    const withTs = `${HUAWEI_WAN_LIST_ASP}?t=${Date.now()}`;
    return (
      (await this.fetchHuaweiPage(withTs)) ?? (await this.fetchHuaweiPage(HUAWEI_WAN_LIST_ASP))
    );
  }

  /**
   * Some firmwares emit `new WANPPP(...)` / `new WanPPP(...)` rows (same idea as K562 `MainTopAP.asp`).
   * First quoted arg is often the TR-069 domain; the next is often the PPPoE login.
   */
  private matchPppoeFromHuaweiWanPppConstructors(raw: string | null): string | null {
    if (!raw) return null;
    const ctorRe = /new\s+(?:WANPPP|WanPPP)\s*\(([^)]*)\)/gi;
    let m: RegExpExecArray | null;
    while ((m = ctorRe.exec(raw)) !== null) {
      const parts = [...m[1].matchAll(/"([^"]*)"/g)].map((x) => this.unescapeHuaweiHex(x[1]));
      const u = this.pickPppoeFromWanPppQuotedParts(parts);
      if (u) return u;
    }
    return null;
  }

  private pickPppoeFromWanPppQuotedParts(parts: string[]): string | null {
    if (!parts.length) return null;
    const first = parts[0]?.trim() ?? '';
    if (first.includes('InternetGatewayDevice')) {
      const withAt = parts.slice(1).find((p) => p.includes('@'));
      if (withAt?.trim()) return withAt.trim();
      const second = parts[1]?.trim() ?? '';
      if (second) return second;
      for (let i = 2; i < parts.length; i++) {
        const p = parts[i]?.trim();
        if (!p) continue;
        if (
          /^(Connected|Connecting|Disconnected|IP_Routed|IP_Bridged|PPPoE|DHCP|Static|AlwaysOn|OnDemand|Automatic|Manual)$/i.test(
            p,
          )
        ) {
          continue;
        }
        if (p === '0' || p === '1') continue;
        return p;
      }
      return null;
    }
    return first || null;
  }

  /**
   * EG8145V5-style `wan_list.asp`: `new WanInfoInst(...)` with EncapMode `PPPoE` and an INTERNET-style
   * service list; login is typically a quoted string containing `@`.
   */
  private matchPppoeFromHuaweiWanInfoInstInternetPppoe(raw: string | null): string | null {
    if (!raw) return null;
    const headRe = /new\s+WanInfoInst\s*\(/gi;
    let hm: RegExpExecArray | null;
    while ((hm = headRe.exec(raw)) !== null) {
      const openParen = hm.index + hm[0].length - 1;
      const closeParen = this.findMatchingClosingParen(raw, openParen);
      if (closeParen < 0) continue;
      const body = raw.slice(openParen + 1, closeParen);
      if (!/PPPoE/i.test(body) || !/INTERNET/i.test(body)) continue;
      const u = this.matchQuotedAtUserInWanInfoBody(body);
      if (u) return u;
    }
    return null;
  }

  private findMatchingClosingParen(raw: string, openParenIndex: number): number {
    let depth = 1;
    let inStr = false;
    let esc = false;
    let q: '"' | "'" | null = null;
    for (let i = openParenIndex + 1; i < raw.length; i++) {
      const c = raw[i];
      if (inStr) {
        if (esc) {
          esc = false;
          continue;
        }
        if (c === '\\') {
          esc = true;
          continue;
        }
        if (q && c === q) {
          inStr = false;
          q = null;
          continue;
        }
        continue;
      }
      if (c === '"' || c === "'") {
        inStr = true;
        q = c;
        continue;
      }
      if (c === '(') {
        depth++;
        continue;
      }
      if (c === ')') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  private matchQuotedAtUserInWanInfoBody(body: string): string | null {
    const re = /"([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const s = this.unescapeHuaweiHex(m[1]).trim();
      if (!s.includes('@')) continue;
      if (s.includes('InternetGatewayDevice')) continue;
      if (s.length < 4) continue;
      return s;
    }
    return null;
  }

  /**
   * Inner HTML of `<select>` when `id` or `name` matches `token` (some WAN pages use only `name`).
   */
  private matchHuaweiSelectInnerHtmlByIdOrName(raw: string | null, token: string): string | null {
    if (!raw) return null;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const byId = new RegExp(
      `<select[^>]*\\bid\\s*=\\s*["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/select>`,
      'i',
    );
    const idMatch = byId.exec(raw);
    if (idMatch) return idMatch[1];
    const byName = new RegExp(
      `<select[^>]*\\bname\\s*=\\s*["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/select>`,
      'i',
    );
    return byName.exec(raw)?.[1] ?? null;
  }

  /**
   * `wan.asp` / `waninfo.asp` often omit `<option selected>`; values then live only in inline script
   * (especially in `wan_list.asp` beside `WanInfoInst` / model objects).
   */
  private matchHuaweiWanIpVersionFromFirmwareScripts(raw: string | null): string | null {
    if (!raw) return null;
    for (const { re } of HUAWEI_WAN_IP_VERSION_SCRIPT_PATTERNS) {
      const m = re.exec(raw);
      if (!m?.[1]) continue;
      const v = this.unescapeHuaweiHex(m[1].trim());
      if (v === 'IPv4' || v === 'IPv6' || v === 'IPv4/IPv6') return v;
    }
    return null;
  }

  private matchSelectSelectedTextBySelector(raw: string | null, selector: string): string | null {
    const ids = this.extractIdsFromSelector(selector);
    for (const id of ids) {
      const value = this.matchSelectSelectedTextById(raw, id);
      if (value != null) return value;
    }
    return null;
  }

  private matchSelectSelectedTextById(raw: string | null, id: string): string | null {
    if (!raw) return null;
    const selectBody = this.matchHuaweiSelectInnerHtmlByIdOrName(raw, id);
    if (!selectBody) return null;
    let optionInner =
      /<option[^>]*selected[^>]*>([\s\S]*?)<\/option>/i.exec(selectBody)?.[1] ??
      // Huawei often omits `selected` in the HTML and applies it in JS; first option is the HTML5 default.
      /<option\b[^>]*>([\s\S]*?)<\/option>/i.exec(selectBody)?.[1];
    if (!optionInner) return null;
    const text = optionInner.replace(/<[^>]+>/g, '').trim();
    return text ? this.unescapeHuaweiHex(text) : null;
  }

  private async extractWlanData(): Promise<
    Pick<
      ExtractionResult,
      'wlan24GhzConfig' | 'wlan5GhzConfig' | 'wlan24GhzSsids' | 'wlan5GhzSsids'
    >
  > {
    const raw = await this.fetchFirstHuaweiPage(HUAWEI_WLAN_BASIC_ENDPOINTS);
    if (!raw) {
      return {
        wlan24GhzConfig: undefined,
        wlan5GhzConfig: undefined,
        wlan24GhzSsids: undefined,
        wlan5GhzSsids: undefined,
      };
    }

    const wifiByBand = this.parseWlanWifiByBand(raw);
    const ssidByBand = this.parseWlanSsidByBand(raw);

    return {
      wlan24GhzConfig: wifiByBand['24ghz']
        ? {
            enabled: wifiByBand['24ghz'].enabled,
            channel: wifiByBand['24ghz'].channel,
            mode: wifiByBand['24ghz'].mode,
            bandWidth: wifiByBand['24ghz'].bandWidth,
            transmittingPower: wifiByBand['24ghz'].transmittingPower,
          }
        : undefined,
      wlan5GhzConfig: wifiByBand['5ghz']
        ? {
            enabled: wifiByBand['5ghz'].enabled,
            channel: wifiByBand['5ghz'].channel,
            mode: wifiByBand['5ghz'].mode,
            bandWidth: wifiByBand['5ghz'].bandWidth,
            transmittingPower: wifiByBand['5ghz'].transmittingPower,
          }
        : undefined,
      wlan24GhzSsids: ssidByBand['24ghz'],
      wlan5GhzSsids: ssidByBand['5ghz'],
    };
  }

  private parseWlanWifiByBand(raw: string): Record<
    '24ghz' | '5ghz',
    | {
        enabled: boolean;
        mode: string;
        channel: string;
        transmittingPower: string;
        bandWidth: string;
      }
    | undefined
  > {
    const byBand: Record<
      '24ghz' | '5ghz',
      | {
          enabled: boolean;
          mode: string;
          channel: string;
          transmittingPower: string;
          bandWidth: string;
        }
      | undefined
    > = { '24ghz': undefined, '5ghz': undefined };

    const pattern =
      /new\s+stWlanWifi\(\s*"([^"]*)"\s*,\s*"[^"]*"\s*,\s*"([^"]*)"\s*,\s*"[^"]*"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"([^"]*)"/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(raw)) !== null) {
      const domain = this.unescapeHuaweiHex(match[1]);
      const band = this.bandFromWlanDomain(domain);
      if (!band) continue;

      byBand[band] = {
        enabled: match[2] === '1',
        mode: this.unescapeHuaweiHex(match[3]),
        channel: this.unescapeHuaweiHex(match[4]),
        transmittingPower: this.unescapeHuaweiHex(match[5]),
        bandWidth: this.unescapeHuaweiHex(match[6]),
      };
    }

    return byBand;
  }

  private parseWlanSsidByBand(
    raw: string,
  ): Record<
    '24ghz' | '5ghz',
    ExtractionResult['wlan24GhzSsids'] | ExtractionResult['wlan5GhzSsids']
  > {
    const byBand: Record<'24ghz' | '5ghz', NonNullable<ExtractionResult['wlan24GhzSsids']>> = {
      '24ghz': [],
      '5ghz': [],
    };

    const pattern =
      /new\s+stWlan\(\s*"([^"]*)"\s*,\s*"[^"]*"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"[^"]*"\s*,\s*"([^"]*)"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"([^"]*)"/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(raw)) !== null) {
      const domain = this.unescapeHuaweiHex(match[1]);
      const band = this.bandFromWlanDomain(domain);
      if (!band) continue;

      byBand[band].push({
        enabled: match[2] === '1',
        ssidName: this.unescapeHuaweiHex(match[3]),
        ssidHideMode: match[4] === '1',
        maxClients: Number.parseInt(match[5], 10) || 0,
        wpa2SecurityType: this.unescapeHuaweiHex(match[6]),
        ssidPassword: this.unescapeHuaweiHex(match[7]),
      });
    }

    return byBand;
  }

  private bandFromWlanDomain(domain: string): '24ghz' | '5ghz' | null {
    const match = /WLANConfiguration\.(\d+)/i.exec(domain);
    if (!match) return null;
    const idx = Number.parseInt(match[1], 10);
    if (!Number.isFinite(idx)) return null;
    if (idx >= 1 && idx <= 4) return '24ghz';
    if (idx >= 5 && idx <= 8) return '5ghz';
    return null;
  }

  private async extractLanData(): Promise<
    Pick<
      ExtractionResult,
      | 'dhcpEnabled'
      | 'dhcpIpAddress'
      | 'dhcpSubnetMask'
      | 'dhcpStartIp'
      | 'dhcpEndIp'
      | 'dhcpIspDnsEnabled'
      | 'dhcpPrimaryDns'
      | 'dhcpSecondaryDns'
      | 'dhcpLeaseTimeMode'
      | 'dhcpLeaseTime'
    >
  > {
    const raw = await this.fetchFirstHuaweiPage(HUAWEI_LAN_ENDPOINTS);
    const dhcpEnabled =
      this.matchCheckedBySelector(raw, this.s.advLanDhcpServerEnable) ??
      this.matchCheckedBySelector(raw, this.s.advLanDhcpRelayEnable);
    const dhcpIspDnsEnabled = this.matchCheckedBySelector(raw, '#dnsAuto');

    return {
      dhcpEnabled: dhcpEnabled ?? undefined,
      dhcpIpAddress: this.matchInputValueBySelector(raw, this.s.advLanDhcpHostIp) ?? undefined,
      dhcpSubnetMask: this.matchInputValueBySelector(raw, this.s.advLanDhcpSubnetMask) ?? undefined,
      dhcpStartIp: this.matchInputValueBySelector(raw, this.s.advLanDhcpStartIp) ?? undefined,
      dhcpEndIp: this.matchInputValueBySelector(raw, this.s.advLanDhcpEndIp) ?? undefined,
      dhcpIspDnsEnabled: dhcpIspDnsEnabled ?? undefined,
      dhcpPrimaryDns: this.matchInputValueBySelector(raw, this.s.advLanPrimaryDns) ?? undefined,
      dhcpSecondaryDns: this.matchInputValueBySelector(raw, this.s.advLanSecondaryDns) ?? undefined,
      dhcpLeaseTimeMode:
        this.matchSelectSelectedValueBySelector(raw, this.s.advLanLeaseTime2) ?? undefined,
      dhcpLeaseTime: this.matchInputValueBySelector(raw, this.s.advLanLeaseTime1) ?? undefined,
    };
  }

  private matchSelectSelectedValueBySelector(raw: string | null, selector: string): string | null {
    const ids = this.extractIdsFromSelector(selector);
    for (const id of ids) {
      const value = this.matchSelectSelectedValueById(raw, id);
      if (value != null) return value;
    }
    return null;
  }

  private matchSelectSelectedValueById(raw: string | null, id: string): string | null {
    if (!raw) return null;
    const selectBody = this.matchHuaweiSelectInnerHtmlByIdOrName(raw, id);
    if (!selectBody) return null;
    const selectedTag =
      /<option[^>]*selected[^>]*>/i.exec(selectBody)?.[0] ??
      /<option\b[^>]*>/i.exec(selectBody)?.[0];
    if (!selectedTag) return null;
    const value = /value=["']([^"']*)["']/i.exec(selectedTag)?.[1];
    return value == null ? null : this.unescapeHuaweiHex(value);
  }

  private matchCheckedBySelector(raw: string | null, selector: string): boolean | null {
    const ids = this.extractIdsFromSelector(selector);
    for (const id of ids) {
      const checked = this.matchCheckedById(raw, id);
      if (checked != null) return checked;
    }
    return null;
  }

  private matchCheckedById(raw: string | null, id: string): boolean | null {
    if (!raw) return null;
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tag = new RegExp(`<input[^>]*id=["']${escapedId}["'][^>]*>`, 'i').exec(raw)?.[0];
    if (!tag) return null;
    // Use `\bchecked\b` so `checked` as the first attribute matches (`<input checked ...>`), not only after whitespace.
    return /<input\b[^>]*\bchecked\b/i.test(tag);
  }

  private async extractUpnpData(): Promise<Pick<ExtractionResult, 'upnpEnabled'>> {
    const raw = await this.fetchHuaweiPage(HUAWEI_UPNP_ENDPOINT);
    const enabledRaw = this.matchQuotedVar(raw, 'enblMainUpnp');
    return {
      upnpEnabled:
        enabledRaw == null ? undefined : enabledRaw === '1' || enabledRaw.toLowerCase() === 'true',
    };
  }

  private matchQuotedVar(raw: string | null, varName: string): string | null {
    if (!raw) return null;
    const escapedName = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`var\\s+${escapedName}\\s*=\\s*['"]([^'"]*)['"]`, 'i').exec(raw);
    return match?.[1] ?? null;
  }

  private async extractRouterVersionData(): Promise<Pick<ExtractionResult, 'routerVersion'>> {
    const raw = await this.fetchHuaweiPage(HUAWEI_DEVICE_INFO_ENDPOINT);
    const rowValue = this.matchHtmlValue(raw, this.s.siVersion);
    if (rowValue) return { routerVersion: rowValue };

    const fromDeviceInfoCtor = this.matchDeviceInfoSoftwareVersion(raw);
    return { routerVersion: fromDeviceInfoCtor ?? undefined };
  }

  private matchDeviceInfoSoftwareVersion(raw: string | null): string | null {
    if (!raw) return null;
    const match = /new\s+stDeviceInfo\(\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"([^"]+)"/.exec(
      raw,
    );
    return match ? this.unescapeHuaweiHex(match[1]) : null;
  }

  private matchHtmlValue(raw: string | null, cssIdSelector: string): string | null {
    if (!raw || !cssIdSelector.startsWith('#')) return null;
    const id = cssIdSelector.slice(1);
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tdRegex = new RegExp(`<[^>]*id=["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i');
    const td = tdRegex.exec(raw)?.[1];
    if (!td) return null;
    const text = td.replace(/<[^>]+>/g, '').trim();
    return text || null;
  }

  private async extractTr069UrlData(): Promise<Pick<ExtractionResult, 'tr069Url'>> {
    const raw = await this.fetchFirstHuaweiPage(HUAWEI_TR069_ENDPOINTS);
    return {
      tr069Url: this.matchInputValueBySelector(raw, this.s.advTr069Url) ?? undefined,
    };
  }

  private matchInputValueBySelector(raw: string | null, selector: string): string | null {
    const ids = this.extractIdsFromSelector(selector);
    for (const id of ids) {
      const value = this.matchInputValueById(raw, id);
      if (value != null) return value;
    }
    return null;
  }

  private extractIdsFromSelector(selector: string): string[] {
    return selector
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.startsWith('#'))
      .map((part) => part.slice(1));
  }

  private matchInputValueById(raw: string | null, id: string): string | null {
    if (!raw) return null;
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tag = new RegExp(`<input[^>]*id=["']${escapedId}["'][^>]*>`, 'i').exec(raw)?.[0];
    if (!tag) return null;
    const value = /value=["']([^"']*)["']/i.exec(tag)?.[1];
    return value == null ? null : this.unescapeHuaweiHex(value);
  }

  private unescapeHuaweiHex(value: string): string {
    return value.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
  }

  private async fetchFirstHuaweiPage(paths: string[]): Promise<string | null> {
    for (const path of paths) {
      const raw = await this.fetchHuaweiPage(path);
      if (raw) return raw;
    }
    return null;
  }

  /** Join WAN ASP responses so fields that exist on only one page (e.g. `#ProtocolType` on `waninfo.asp`) parse correctly. */
  private async fetchHuaweiWanPagesMerged(): Promise<string | null> {
    const parts: string[] = [];
    for (const path of HUAWEI_WAN_ENDPOINTS) {
      const raw = await this.fetchHuaweiPage(path);
      if (raw?.trim()) parts.push(raw);
    }
    return parts.length ? parts.join('\n') : null;
  }

  private huaweiSnippetAround(haystack: string | null, needle: string, pad: number): string | null {
    if (!haystack) return null;
    const i = haystack.toLowerCase().indexOf(needle.toLowerCase());
    if (i < 0) return null;
    const start = Math.max(0, i - pad);
    const end = Math.min(haystack.length, i + needle.length + pad);
    let s = haystack.slice(start, end).replace(/\s+/g, ' ');
    if (start > 0) s = `…${s}`;
    if (end < haystack.length) s = `${s}…`;
    return s;
  }

  private analyzeBodyForWanIpVersionFetchMeta(
    path: string,
    ok: boolean,
    status: number,
    redirected: boolean,
    text: string | null,
    error: string | null,
  ): HuaweiWanIpVersionFetchMeta {
    const t = text ?? '';
    const head = t.replace(/\s+/g, ' ').trim().slice(0, 360);
    return {
      path,
      ok,
      status,
      redirected,
      length: t.length,
      error,
      looksLikeAuthShell:
        /(?:name=["']txt_[Pp]assword["']|id=["']txt_[Pp]assword["']|LoginRequest|login\.asp|session\s*(?:has\s*)?expired)/i.test(
          t.slice(0, 12000),
        ),
      hasSubstringProtocolType: /ProtocolType/i.test(t),
      hasSelectIdProtocolType: /<select[^>]*\bid\s*=\s*["']ProtocolType["']/i.test(t),
      hasSelectNameProtocolType: /<select[^>]*\bname\s*=\s*["']ProtocolType["']/i.test(t),
      snippetNearProtocolType: this.huaweiSnippetAround(t, 'ProtocolType', 160),
      bodyHead: head.length ? head : null,
    };
  }

  private async fetchHuaweiPageWithMeta(path: string): Promise<HuaweiWanIpVersionFetchMeta> {
    try {
      const response = await fetch(path, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const text = await response.text();
      return this.analyzeBodyForWanIpVersionFetchMeta(
        path,
        response.ok,
        response.status,
        response.redirected,
        text,
        null,
      );
    } catch (e) {
      return this.analyzeBodyForWanIpVersionFetchMeta(path, false, 0, false, null, String(e));
    }
  }

  private probeHuaweiWanIpVersionScripts(raw: string | null): HuaweiWanIpVersionScriptProbe[] {
    const src = raw ?? '';
    return HUAWEI_WAN_IP_VERSION_SCRIPT_PATTERNS.map(({ id, re }) => {
      const m = re.exec(src);
      const cap = m?.[1] ?? null;
      const normalized = cap == null ? null : this.unescapeHuaweiHex(cap.trim());
      const acceptedAsIpVersion =
        normalized === 'IPv4' || normalized === 'IPv6' || normalized === 'IPv4/IPv6';
      return {
        patternId: id,
        matched: !!m,
        capture: cap,
        acceptedAsIpVersion,
      };
    });
  }

  private async buildWanIpVersionDiagnostics(
    wanRaw: string | null,
    wanListRaw: string | null,
    resolvedIpVersion: string | undefined,
  ): Promise<HuaweiWanIpVersionDiagnostics> {
    const [wanEndpointFetches, wanListFetch] = await Promise.all([
      Promise.all(HUAWEI_WAN_ENDPOINTS.map((p) => this.fetchHuaweiPageWithMeta(p))),
      this.fetchHuaweiPageWithMeta(`${HUAWEI_WAN_LIST_ASP}?t=${Date.now()}`),
    ]);

    const vSel = this.matchSelectSelectedValueBySelector(wanRaw, '#ProtocolType');
    const tSel = this.matchSelectSelectedTextBySelector(wanRaw, '#ProtocolType');
    const sList = this.matchHuaweiWanIpVersionFromFirmwareScripts(wanListRaw);
    const sWan = this.matchHuaweiWanIpVersionFromFirmwareScripts(wanRaw);

    const inner = wanRaw ? this.matchHuaweiSelectInnerHtmlByIdOrName(wanRaw, 'ProtocolType') : null;
    const optionTagCount = inner ? (inner.match(/<option\b/gi) ?? []).length : 0;
    const anyOptionHasSelectedAttr = inner ? /<option[^>]*\bselected\b/i.test(inner) : false;
    let firstOptionOpenTagPreview: string | null = null;
    if (inner) {
      const ft = /<option\b[^>]*>/i.exec(inner)?.[0];
      firstOptionOpenTagPreview = ft ? ft.slice(0, 240) : null;
    }

    const hints: string[] = [];
    if (!wanRaw?.length) {
      hints.push('Merged WAN HTML is empty — both WAN ASP fetches may have failed or returned empty bodies.');
    }
    for (const f of wanEndpointFetches) {
      if (!f.ok) hints.push(`WAN ${f.path} returned HTTP ${f.status} (ok=false).`);
      if (f.error) hints.push(`WAN ${f.path} fetch error: ${f.error}`);
      if (f.looksLikeAuthShell) hints.push(`WAN ${f.path} body resembles login/session shell, not advanced WAN UI.`);
    }
    if (!wanListFetch.ok) hints.push(`wan_list.asp probe returned HTTP ${wanListFetch.status} (ok=false).`);
    if (wanListFetch.looksLikeAuthShell) hints.push('wan_list.asp body resembles login/session shell.');
    const mergedHasSelect =
      !!wanRaw &&
      (/<select[^>]*\bid\s*=\s*["']ProtocolType["']/i.test(wanRaw) ||
        /<select[^>]*\bname\s*=\s*["']ProtocolType["']/i.test(wanRaw));
    if (wanRaw?.length && !mergedHasSelect) {
      hints.push(
        'Merged WAN HTML has no <select id="ProtocolType"> or name="ProtocolType"> — value may come only from XHR or a different control id.',
      );
    }
    if (mergedHasSelect && inner && !anyOptionHasSelectedAttr) {
      hints.push(
        'Select exists but no <option selected>; parser falls back to first <option> (HTML5 default). If UI differs, firmware may set selection only in JS.',
      );
    }
    if (!resolvedIpVersion) {
      hints.push(
        'ipVersion stayed undefined after select + script fallbacks — compare scriptProbes captures to expected ProtocolType literals.',
      );
    }

    return {
      capturedAtIso: new Date().toISOString(),
      resolvedIpVersion,
      resolutionSteps: [
        { step: 'matchSelectSelectedValueBySelector(#ProtocolType)', value: vSel },
        { step: 'matchSelectSelectedTextBySelector(#ProtocolType)', value: tSel },
        { step: 'matchHuaweiWanIpVersionFromFirmwareScripts(wan_list.asp body used in extract)', value: sList },
        { step: 'matchHuaweiWanIpVersionFromFirmwareScripts(merged WAN)', value: sWan },
      ],
      wanEndpointFetches,
      wanListFetch,
      mergedWanUsedForParsing: {
        length: wanRaw?.length ?? 0,
        selectInnerFound: inner != null,
        selectInnerLength: inner?.length ?? null,
        optionTagCount,
        anyOptionHasSelectedAttr,
        firstOptionOpenTagPreview,
        firstResolvedValue: vSel,
        firstResolvedText: tSel,
      },
      scriptProbesOnWanList: this.probeHuaweiWanIpVersionScripts(wanListRaw),
      scriptProbesOnMergedWan: this.probeHuaweiWanIpVersionScripts(wanRaw),
      hints,
    };
  }

  private async fetchHuaweiPage(path: string): Promise<string | null> {
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

  private async extractLinkSpeedData(): Promise<Pick<ExtractionResult, 'linkSpeed'>> {
    return { linkSpeed: undefined };
  }

  private async extractRemoteAccessData(): Promise<
    Pick<ExtractionResult, 'remoteAccessIpv4Enabled' | 'remoteAccessIpv6Enabled'>
  > {
    return {
      remoteAccessIpv4Enabled: undefined,
      remoteAccessIpv6Enabled: undefined,
    };
  }
}
