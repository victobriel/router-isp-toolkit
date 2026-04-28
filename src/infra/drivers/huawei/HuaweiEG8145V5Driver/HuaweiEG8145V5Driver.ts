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
    const wanRaw = await this.fetchFirstHuaweiPage(HUAWEI_WAN_ENDPOINTS);
    const diagnoseRaw = await this.fetchHuaweiPage(HUAWEI_DIAGNOSE_ENDPOINT);

    const internetEnabled = this.matchCheckedBySelector(wanRaw, this.s.advWanEnable);
    const pppoeUsername = this.matchInputValueBySelector(wanRaw, this.s.advPppoeUsername);
    const ipVersion =
      this.matchSelectSelectedValueBySelector(wanRaw, '#ProtocolType') ??
      this.matchSelectSelectedTextBySelector(wanRaw, '#ProtocolType');
    const requestPd = this.matchCheckedBySelector(wanRaw, this.s.advPdEnable);
    const dhcpv6 = this.matchCheckedBySelector(wanRaw, this.s.advDhcpv6Enable);

    const tr069EnabledRaw = this.matchQuotedVar(diagnoseRaw, 'Tr069Enable');

    return {
      internetEnabled: internetEnabled ?? undefined,
      tr069Enabled:
        tr069EnabledRaw == null
          ? undefined
          : tr069EnabledRaw === '1' || tr069EnabledRaw.toLowerCase() === 'true',
      pppoeUsername: pppoeUsername ?? undefined,
      ipVersion: ipVersion ?? undefined,
      requestPdEnabled: requestPd ?? undefined,
      slaacEnabled: dhcpv6 == null ? undefined : !dhcpv6,
      dhcpv6Enabled: dhcpv6 ?? undefined,
      pdEnabled: requestPd ?? undefined,
    };
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
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const selectBody = new RegExp(
      `<select[^>]*id=["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/select>`,
      'i',
    ).exec(raw)?.[1];
    if (!selectBody) return null;
    const selectedText = /<option[^>]*selected[^>]*>([\s\S]*?)<\/option>/i.exec(selectBody)?.[1];
    if (!selectedText) return null;
    const text = selectedText.replace(/<[^>]+>/g, '').trim();
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
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const selectBody = new RegExp(
      `<select[^>]*id=["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/select>`,
      'i',
    ).exec(raw)?.[1];
    if (!selectBody) return null;
    const selectedTag = /<option[^>]*selected[^>]*>/i.exec(selectBody)?.[0];
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
    return /\schecked(?:=["'][^"']*["'])?/i.test(tag);
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
