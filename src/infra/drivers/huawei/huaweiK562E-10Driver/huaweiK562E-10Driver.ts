import { IDomGateway } from '@/application/ports/IDomGateway';
import { ExtractionFilter, RouterPage, RouterPageKey } from '@/application/types';
import { ButtonConfig } from '@/domain/ports/IRouter.types';
import {
  ExtractionResult,
  ExtractionResultSchema,
  PingTestResult,
} from '@/domain/schemas/validation';
import { ITopologySectionParser } from '../../shared/TopologySectionParser';
import { TopologyBand, TopologyClient } from '../../shared/types';
import { HuaweiK562E10Selectors } from './huaweiK562E-10Selectors';
import { HuaweiBaseDriver } from '../shared/HuaweiBaseDriver';

const HUAWEI_USER_DEVICE_INFO_ENDPOINT = '/html/bbsp/common/GetLanUserDevInfo.asp';
const HUAWEI_USER_DEVICE_PATTERN =
  /new\s+USERDevice\s*\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)/g;
const HUAWEI_SSID_24GHZ_MAX = 4;
const HUAWEI_SSID_5GHZ_MAX = 8;

const HUAWEI_MAIN_TOP_ENDPOINT = '/html/bbsp/maintop/MainTopAP.asp';
const HUAWEI_WAN_ENDPOINT = '/html/bbsp/internetAP/internetAP.asp';
const HUAWEI_WLAN_ENDPOINT = '/html/amp/wlanbasic/simplewificfgAP.asp';
const HUAWEI_LAN_ENDPOINT = '/html/bbsp/landhcp/landhcp_ap.asp';
const HUAWEI_UPNP_ENDPOINT = '/html/bbsp/upnp/upnp_ap.asp';
const HUAWEI_DEVICE_INFO_ENDPOINT = '/html/ssmp/deviceinfo/deviceinfo_ap.asp';
const HUAWEI_TR069_ENDPOINT = '/html/ssmp/tr069/tr069.asp';

interface ParsedHuaweiUserDevice {
  ipAddr: string;
  macAddr: string;
  port: string;
  status: string;
  portType: string;
  hostName: string;
}

export class HuaweiK562E10Driver extends HuaweiBaseDriver {
  constructor(topologyParser: ITopologySectionParser, domService: IDomGateway) {
    super('HUAWEI K562E-10', HuaweiK562E10Selectors, topologyParser, domService);
  }

  public async extract(filter?: ExtractionFilter): Promise<ExtractionResult> {
    const extractors: Record<ExtractionFilter[number], () => Promise<Partial<ExtractionResult>>> = {
      topology: () => this.extractTopologyData(),
      wan: () => this.extractWanData(),
      remoteAccess: async () => ({
        remoteAccessIpv4Enabled: undefined,
        remoteAccessIpv6Enabled: undefined,
      }),
      wlan: () => this.extractWlanData(),
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
    const onLoginPage = this.isLoginPage();
    const hasTopFrame =
      this.domService.getHTMLElement('#functioncontent', HTMLElement) != null ||
      this.domService.getHTMLElement('#name_MainPage', HTMLElement) != null;
    return !onLoginPage && hasTopFrame;
  }

  public override ping(_ip: string): Promise<PingTestResult | null> {
    throw new Error('Method not implemented.');
  }

  public override reboot(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  public override goToPage(_page: RouterPage, _key: RouterPageKey): void {
    throw new Error('Method not implemented.');
  }

  private async extractTopologyData(): Promise<Pick<ExtractionResult, 'topology'>> {
    const grouped: Record<TopologyBand, TopologyClient[]> = {
      '24ghz': [],
      '5ghz': [],
      cable: [],
    };

    const raw = await this.fetchHuaweiPage(HUAWEI_USER_DEVICE_INFO_ENDPOINT);
    if (raw) {
      for (const dev of this.parseHuaweiUserDevices(raw)) {
        if (dev.status.toUpperCase() !== 'ONLINE') continue;
        const band = this.classifyHuaweiTopologyBand(dev.portType, dev.port);
        if (!band) continue;
        grouped[band].push({
          name: dev.hostName || dev.macAddr,
          ip: dev.ipAddr,
          mac: dev.macAddr,
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
    const mainTopRaw = await this.fetchHuaweiPage(HUAWEI_MAIN_TOP_ENDPOINT);
    const wanRaw = await this.fetchHuaweiPage(HUAWEI_WAN_ENDPOINT);

    const pppoeUsername =
      this.matchInputValueById(wanRaw, 'UserName') ?? this.matchWanUsernameFromMainTop(mainTopRaw);
    const tr069Flag = this.matchMainTopTr069(mainTopRaw);
    const ipVersion = this.matchWanIpVersion(wanRaw, mainTopRaw);
    const dhcpv6Enabled = this.matchMainTopIpv6Enabled(mainTopRaw);

    return {
      internetEnabled: this.matchMainTopInternetConnected(mainTopRaw) ?? undefined,
      tr069Enabled: tr069Flag ?? undefined,
      pppoeUsername: pppoeUsername ?? undefined,
      ipVersion: ipVersion ?? undefined,
      requestPdEnabled: undefined,
      slaacEnabled: undefined,
      dhcpv6Enabled: dhcpv6Enabled ?? undefined,
      pdEnabled: undefined,
    };
  }

  private async extractWlanData(): Promise<
    Pick<
      ExtractionResult,
      'wlan24GhzConfig' | 'wlan5GhzConfig' | 'wlan24GhzSsids' | 'wlan5GhzSsids'
    >
  > {
    const raw = await this.fetchHuaweiPage(HUAWEI_WLAN_ENDPOINT);
    if (!raw) {
      return {
        wlan24GhzConfig: undefined,
        wlan5GhzConfig: undefined,
        wlan24GhzSsids: undefined,
        wlan5GhzSsids: undefined,
      };
    }

    const byBand = this.parseWlanSsidByBand(raw);
    const ssids24 = byBand['24ghz'] ?? [];
    const ssids5 = byBand['5ghz'] ?? [];
    const first24 = ssids24[0];
    const first5 = ssids5[0];
    const transmit24 = this.matchQuotedVar(raw, 'WlanTransmitPower');
    const transmit5 = this.matchQuotedVar(raw, 'WlanTransmitPower5g');
    const currChannel = this.matchQuotedVar(raw, 'currChannel');

    return {
      wlan24GhzConfig: first24
        ? {
            enabled: first24.enabled,
            channel: currChannel ?? undefined,
            mode: first24.wpa2SecurityType,
            bandWidth: undefined,
            transmittingPower: transmit24 ?? undefined,
          }
        : undefined,
      wlan5GhzConfig: first5
        ? {
            enabled: first5.enabled,
            channel: undefined,
            mode: first5.wpa2SecurityType,
            bandWidth: undefined,
            transmittingPower: transmit5 ?? undefined,
          }
        : undefined,
      wlan24GhzSsids: ssids24,
      wlan5GhzSsids: ssids5,
    };
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
    const raw = await this.fetchHuaweiPage(HUAWEI_LAN_ENDPOINT);
    const ipAddress = this.matchLanHostAddress(raw);
    const subnetMask = this.matchLanHostSubnetMask(raw);
    const rangeBase =
      this.matchInputValueById(raw, 'routeIPRange') ?? ipAddress?.split('.').slice(0, 3).join('.');
    const start = this.matchInputValueById(raw, 'mainstartipaddr');
    const end = this.matchInputValueById(raw, 'mainendipaddr');

    return {
      dhcpEnabled: this.matchDhcpFlag(raw) ?? undefined,
      dhcpIpAddress: ipAddress ?? undefined,
      dhcpSubnetMask: subnetMask ?? undefined,
      dhcpStartIp: start && rangeBase ? `${rangeBase}.${start}` : undefined,
      dhcpEndIp: end && rangeBase ? `${rangeBase}.${end}` : undefined,
      dhcpIspDnsEnabled: undefined,
      dhcpPrimaryDns: this.matchInputValueById(raw, 'dnsMainPri') ?? undefined,
      dhcpSecondaryDns: this.matchInputValueById(raw, 'dnsMainSec') ?? undefined,
      dhcpLeaseTimeMode:
        this.matchSelectSelectedValueById(raw, 'maindhcpLeasedTimeFrag') ?? undefined,
      dhcpLeaseTime: this.matchInputValueById(raw, 'MainLeasedTime') ?? undefined,
    };
  }

  private async extractUpnpData(): Promise<Pick<ExtractionResult, 'upnpEnabled'>> {
    const raw = await this.fetchHuaweiPage(HUAWEI_UPNP_ENDPOINT);
    const enabledRaw = this.matchQuotedVar(raw, 'enblMainUpnp');
    return {
      upnpEnabled:
        enabledRaw == null ? undefined : enabledRaw === '1' || enabledRaw.toLowerCase() === 'true',
    };
  }

  private async extractRouterVersionData(): Promise<Pick<ExtractionResult, 'routerVersion'>> {
    const raw = await this.fetchHuaweiPage(HUAWEI_DEVICE_INFO_ENDPOINT);
    const rowValue = this.matchHtmlValue(raw, '#td5_2');
    if (rowValue) return { routerVersion: rowValue };

    const fromDeviceInfoCtor = this.matchDeviceInfoSoftwareVersion(raw);
    return { routerVersion: fromDeviceInfoCtor ?? undefined };
  }

  private async extractTr069UrlData(): Promise<Pick<ExtractionResult, 'tr069Url'>> {
    const raw = await this.fetchHuaweiPage(HUAWEI_TR069_ENDPOINT);
    const urlFromInput = this.matchInputValueById(raw, 'URL');
    const urlFromCtor = this.matchTr069UrlFromCtor(raw);
    return { tr069Url: urlFromInput ?? urlFromCtor ?? undefined };
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
      /new\s+stWlan\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"[^"]*"\s*,\s*"([^"]*)"\s*,\s*"[^"]*"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"([^"]*)"/g;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(raw)) !== null) {
      const domain = this.unescapeHuaweiHex(match[1]);
      const band = this.bandFromWlanDomain(domain);
      if (!band) continue;
      byBand[band].push({
        enabled: match[3] === '1',
        ssidName: this.unescapeHuaweiHex(match[2]),
        ssidHideMode: match[4] !== '1',
        maxClients: 0,
        wpa2SecurityType: this.unescapeHuaweiHex(match[5]),
        ssidPassword: this.unescapeHuaweiHex(match[6]),
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

  private matchWanUsernameFromMainTop(raw: string | null): string | null {
    if (!raw) return null;
    const match = /new\s+WANPPP\(([^)]*)\)/.exec(raw);
    if (!match) return null;
    const parts = [...match[1].matchAll(/"([^"]*)"/g)].map((m) => this.unescapeHuaweiHex(m[1]));
    return parts[0] ?? null;
  }

  private matchMainTopTr069(raw: string | null): boolean | null {
    if (!raw) return null;
    const match = /new\s+WANPPP\(([^)]*)\)/.exec(raw);
    if (!match) return null;
    const parts = [...match[1].matchAll(/"([^"]*)"/g)].map((m) => this.unescapeHuaweiHex(m[1]));
    const serviceList = parts[3] ?? '';
    return serviceList.includes('TR069');
  }

  private matchMainTopInternetConnected(raw: string | null): boolean | null {
    if (!raw) return null;
    return /ConnectionStatus\s*==?\s*"Connected"|new\s+WANPPP\(\s*"[^"]*"\s*,\s*"Connected"/i.test(
      raw,
    );
  }

  private matchMainTopIpv6Enabled(raw: string | null): boolean | null {
    if (!raw) return null;
    const match = /new\s+WANPPP\(([^)]*)\)/.exec(raw);
    if (!match) return null;
    const parts = [...match[1].matchAll(/"([^"]*)"/g)].map((m) => this.unescapeHuaweiHex(m[1]));
    const ipv6Enable = parts[8];
    if (ipv6Enable == null) return null;
    return ipv6Enable === '1';
  }

  private matchWanIpVersion(wanRaw: string | null, mainTopRaw: string | null): string | null {
    const v = this.matchSelectSelectedTextById(wanRaw, 'IPv4AddressModeCol');
    if (v) return v;
    const ipv6Enabled = this.matchMainTopIpv6Enabled(mainTopRaw);
    if (ipv6Enabled === true) return 'IPv4/IPv6';
    if (ipv6Enabled === false) return 'IPv4';
    return null;
  }

  private matchLanHostAddress(raw: string | null): string | null {
    if (!raw) return null;
    const m = /new\s+stLanHostInfo\([^,]+,\s*"[^"]*"\s*,\s*"([^"]*)"/.exec(raw);
    return m ? this.unescapeHuaweiHex(m[1]) : null;
  }

  private matchLanHostSubnetMask(raw: string | null): string | null {
    if (!raw) return null;
    const m = /new\s+stLanHostInfo\([^,]+,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"([^"]*)"/.exec(raw);
    return m ? this.unescapeHuaweiHex(m[1]) : null;
  }

  private matchDhcpFlag(raw: string | null): boolean | null {
    if (!raw) return null;
    const flag = /\$\("#dhcpSrvType"\)\.attr\("DHCPServerFlag","([01])"\)/.exec(raw)?.[1];
    if (flag == null) return null;
    return flag === '1';
  }

  private matchTr069UrlFromCtor(raw: string | null): string | null {
    if (!raw) return null;
    const m = /new\s+stCWMP\(([^)]*)\)/.exec(raw);
    if (!m) return null;
    const parts = [...m[1].matchAll(/"([^"]*)"/g)].map((x) => this.unescapeHuaweiHex(x[1]));
    return parts[5] ?? null;
  }

  private matchQuotedVar(raw: string | null, varName: string): string | null {
    if (!raw) return null;
    const escapedName = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`var\\s+${escapedName}\\s*=\\s*['"]([^'"]*)['"]`, 'i').exec(raw);
    return match?.[1] ?? null;
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

  private matchDeviceInfoSoftwareVersion(raw: string | null): string | null {
    if (!raw) return null;
    const match = /new\s+stDeviceInfo\(\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"([^"]+)"/.exec(
      raw,
    );
    return match ? this.unescapeHuaweiHex(match[1]) : null;
  }

  private matchInputValueById(raw: string | null, id: string): string | null {
    if (!raw) return null;
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tag = new RegExp(`<input[^>]*id=["']${escapedId}["'][^>]*>`, 'i').exec(raw)?.[0];
    if (!tag) return null;
    const value = /value=["']([^"']*)["']/i.exec(tag)?.[1];
    return value == null ? null : this.unescapeHuaweiHex(value);
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

  private unescapeHuaweiHex(value: string): string {
    return value.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
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
}
