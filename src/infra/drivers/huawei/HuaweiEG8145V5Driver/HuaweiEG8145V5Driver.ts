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
import {
  HUAWEI_INDEX_ENDPOINT,
  HUAWEI_TR069_ENDPOINT,
  HUAWEI_UPNP_ENDPOINT,
  HUAWEI_ACCESS_CONTROL_ENDPOINT,
  HUAWEI_WAN_ADDRESS_ACQUIRE_ENDPOINT,
  HUAWEI_WAN_LIST_ENDPOINT,
  HUAWEI_WAN_LIST_INFO_ENDPOINT,
} from '../shared/HuaweiCommonDriverConstants';

export class HuaweiEG8145V5Driver extends HuaweiBaseDriver {
  constructor(topologyParser: ITopologySectionParser, domService: IDomGateway) {
    super('HUAWEI EG8145V5', HuaweiEG8145V5Selectors, topologyParser, domService);
  }

  public async extract(filter?: ExtractionFilter): Promise<ExtractionResult> {
    const extractors: Record<ExtractionFilter[number], () => Promise<Partial<ExtractionResult>>> = {
      opticalSignal: async () => ({ opticalSignal: undefined }),
      topology: async () => {
        return {
          topology: undefined,
        };
      },
      wan: async () => this.getWanState(),
      remoteAccess: async () => this.getRemoteAccessState(),
      wlan: async () => {
        return {
          wlan24GhzEnabled: undefined,
          wlan5GhzEnabled: undefined,
          wlan24GhzSsids: undefined,
          wlan5GhzSsids: undefined,
        };
      },
      lan: async () => {
        return {
          lan: undefined,
          dhcpIpAddress: undefined,
          dhcpSubnetMask: undefined,
          dhcpStartIp: undefined,
          dhcpEndIp: undefined,
          dhcpPrimaryDns: undefined,
          dhcpSecondaryDns: undefined,
          dhcpLeaseTimeMode: undefined,
        };
      },
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

  private async getWanState(): Promise<
    Pick<
      ExtractionResult,
      | 'internetEnabled'
      | 'pppoeUsername'
      | 'ipVersion'
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

    // IPv6 acquisition modes — match wan.asp's #IPv6AddressMode1 (DHCPv6) and
    // #IPv6PrefixMode1 (PrefixDelegation) radios. The actual values are patched
    // onto each WanList entry by GetIPv6AddressAcquireInfo / GetIPv6PrefixAcquireInfo
    // in wan_list.asp, sourced from wanaddressacquire.asp.
    let dhcpv6Enabled: boolean | undefined;
    let pdEnabled: boolean | undefined;

    if (data.IPv6Enable !== '1') {
      dhcpv6Enabled = false;
      pdEnabled = false;
    } else if (addressAcquire && data.domain) {
      const addressItems = [
        ...this.parseHuaweiStructCallAll(addressAcquire, 'IPAddressAcquireIPItem'),
        ...this.parseHuaweiStructCallAll(addressAcquire, 'IPAddressAcquirePPPItem'),
      ];
      const prefixItems = this.parseHuaweiStructCallAll(addressAcquire, 'PrefixAcquireItem');

      const addressItem = addressItems.find(
        (item) => typeof item._domain === 'string' && item._domain.includes(data.domain),
      );
      const prefixItem = prefixItems.find(
        (item) => typeof item._domain === 'string' && item._domain.includes(data.domain),
      );

      const addressOrigin = (addressItem?._Origin ?? '').toUpperCase();
      const prefixOrigin = (prefixItem?._Origin ?? '').toUpperCase();

      dhcpv6Enabled = addressOrigin === 'DHCPV6';
      // PrefixAcquireItem coerces AutoConfigured / RouterAdvertisement to
      // PrefixDelegation, so they should also count as PD-enabled.
      pdEnabled =
        prefixOrigin === 'PREFIXDELEGATION' ||
        prefixOrigin === 'AUTOCONFIGURED' ||
        prefixOrigin === 'ROUTERADVERTISEMENT';
    }

    return {
      internetEnabled,
      pppoeUsername,
      ipVersion,
      requestPdEnabled: undefined,
      slaacEnabled: undefined,
      dhcpv6Enabled,
      pdEnabled,
      linkSpeed: undefined,
    };
  }

  private async getRemoteAccessState(): Promise<{
    remoteAccessIpv4Enabled?: boolean;
    remoteAccessIpv6Enabled?: boolean;
  }> {
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

  private async getUpnpState(): Promise<{ upnpEnabled?: boolean }> {
    const raw = await this.fetch(HUAWEI_UPNP_ENDPOINT);
    if (!raw) return { upnpEnabled: undefined };
    const main = this.matchHuaweiScriptVar(raw, 'enblMainUpnp');
    const slave = this.matchHuaweiScriptVar(raw, 'enblSlvUpnp');
    if (main == null || slave == null) return { upnpEnabled: undefined };
    return {
      upnpEnabled: main === '1' && slave === '1',
    };
  }

  private async getTr069State(): Promise<{ tr069Url?: string; tr069Enabled?: boolean }> {
    const raw = await this.fetch(HUAWEI_TR069_ENDPOINT);
    const cwmp = this.parseHuaweiCwmp(raw);
    if (!cwmp) return { tr069Url: undefined, tr069Enabled: undefined };
    return {
      tr069Url: cwmp.URL ? cwmp.URL : undefined,
      tr069Enabled: cwmp.EnableCWMP === '1',
    };
  }

  private async getRouterInfoState(): Promise<{
    routerModel?: string;
    routerVersion?: string;
  }> {
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
}
