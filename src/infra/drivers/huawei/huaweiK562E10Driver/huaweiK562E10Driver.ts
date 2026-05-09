import { IDomGateway } from '@/application/ports/IDomGateway';
import { ExtractionFilter } from '@/application/types';
import { ButtonConfig } from '@/domain/ports/IRouter.types';
import {
  ExtractionResult,
  ExtractionResultSchema,
  type PingTestResult,
} from '@/domain/schemas/validation';
import { ITopologySectionParser } from '@/infra/drivers/shared/TopologySectionParser';
import { HuaweiK562E10Selectors } from '@/infra/drivers/huawei/huaweiK562E10Driver/huaweiK562E10Selectors';
import { huaweiIpv6AddressModeLabel } from '@/infra/drivers/huawei/HuaweiEG8145V5Driver/utils';
import { HuaweiBaseDriver } from '@/infra/drivers/huawei/shared/HuaweiBaseDriver';
import { ENDPOINT } from '@/infra/drivers/huawei/huaweiK562E10Driver/contants';

export class HuaweiK562E10Driver extends HuaweiBaseDriver {
  constructor(topologyParser: ITopologySectionParser, domService: IDomGateway) {
    super('HUAWEI K562E-10', HuaweiK562E10Selectors, topologyParser, domService);
  }

  public async extract(filter?: ExtractionFilter): Promise<ExtractionResult> {
    const extractors: Record<ExtractionFilter[number], () => Promise<Partial<ExtractionResult>>> = {
      opticalSignal: async () => ({ opticalSignal: undefined }),
      topology: function (): Promise<Pick<ExtractionResult, 'topology'>> {
        return Promise.resolve({
          topology: undefined,
        });
      },
      wan: () => this.getWanState(),
      remoteAccess: function (): Promise<
        Pick<ExtractionResult, 'remoteAccessIpv4Enabled' | 'remoteAccessIpv6Enabled'>
      > {
        return Promise.resolve({
          remoteAccessIpv4Enabled: undefined,
          remoteAccessIpv6Enabled: undefined,
        });
      },
      wlan: function (): Promise<
        Pick<
          ExtractionResult,
          | 'wlan24GhzConfig'
          | 'wlan5GhzConfig'
          | 'wlan24GhzSsids'
          | 'wlan5GhzSsids'
          | 'bandSteeringEnabled'
        >
      > {
        return Promise.resolve({
          wlan24GhzConfig: undefined,
          wlan5GhzConfig: undefined,
          wlan24GhzSsids: undefined,
          wlan5GhzSsids: undefined,
          bandSteeringEnabled: undefined,
        });
      },
      lan: function (): Promise<
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
        return Promise.resolve({
          dhcpEnabled: undefined,
          dhcpRelayStatus: undefined,
          dhcpIpAddress: undefined,
          dhcpSubnetMask: undefined,
          dhcpStartIp: undefined,
          dhcpEndIp: undefined,
          dhcpPrimaryDns: undefined,
          dhcpSecondaryDns: undefined,
          dhcpLeaseTimeMode: undefined,
        });
      },
      upnp: function (): Promise<Pick<ExtractionResult, 'upnpEnabled'>> {
        return Promise.resolve({ upnpEnabled: undefined });
      },
      tr069: function (): Promise<Pick<ExtractionResult, 'tr069Url' | 'tr069Enabled'>> {
        return Promise.resolve({ tr069Url: undefined, tr069Enabled: undefined });
      },
      routerInfo: function (): Promise<Pick<ExtractionResult, 'routerModel' | 'routerVersion'>> {
        return Promise.resolve({ routerModel: undefined, routerVersion: undefined });
      },
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
      targetSelector: '#loginWrapper',
      text: 'Run data extraction',
      style: `
        position: absolute;
        bottom: 6.5px;
        left: 27px;
        z-index: 10000;
        padding: 8px;
        color: #181717;
        border: none;
        cursor: pointer;
        background-color: transparent;
      `,
      extLogoStyle: `
        font-size: 9px;
        color: gray;
        margin-left: 4px;
      `,
    };
  }

  public override isAuthenticated(): boolean {
    const indexPage = this.domService.getHTMLElement(this.s.indexPage, HTMLElement);
    const onLoginPage = this.isLoginPage();
    return !onLoginPage && !!indexPage;
  }

  public override async reboot(): Promise<{ success: boolean; message?: string }> {
    return { success: false, message: 'Method not implemented.' };
  }

  /**
   * This model’s admin UI does not reuse the EG8145V5 `diagnosecommon.asp` /
   * `complex.cgi` IPPingDiagnostics path. Returning `null` lets the app show an
   * unsupported / failed ping state instead of calling the wrong endpoints.
   */
  public override async ping(_ip: string): Promise<PingTestResult | null> {
    return null;
  }

  /**
   * WAN summary for the routed Internet PVC — same ASP bundle and `WanIP` / `WanPPP`
   * parsing as {@link HuaweiEG8145V5Driver.getWanState} (see `docs/HuaweiK562E10/getWanDynamicData.asp`).
   */
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
      this.fetch(ENDPOINT.WAN_LIST_INFO),
      this.fetch(ENDPOINT.WAN_LIST),
      this.fetch(ENDPOINT.WAN_ADDRESS_ACQUIRE),
    ]);

    if (!info || !list) return undefinedResult;

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

    let ipVersion: string | undefined;
    if (data.IPv4Enable === '1' && data.IPv6Enable === '1') ipVersion = 'IPv4/IPv6';
    else if (data.IPv4Enable === '1') ipVersion = 'IPv4';
    else if (data.IPv6Enable === '1') ipVersion = 'IPv6';

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
      const lanAddressRaw = await this.fetch(ENDPOINT.LAN_ADDRESS);
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
        pdEnabled =
          prefixOrigin === 'PREFIXDELEGATION' ||
          prefixOrigin === 'AUTOCONFIGURED' ||
          prefixOrigin === 'ROUTERADVERTISEMENT';
      }

      const ipv6AddressModeRaw =
        data.IPv6AddressMode?.trim() || '' || addressItem?._Origin?.trim() || '';
      if (ipv6AddressModeRaw !== '') {
        const label = huaweiIpv6AddressModeLabel(ipv6AddressModeRaw);
        if (label !== undefined) {
          ipAcquisitionMode = label;
        }
      }
      const ipv6PrefixModeRaw =
        data.IPv6PrefixMode?.trim() || '' || prefixItem?._Origin?.trim() || '';
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

  private async getTr069Url(): Promise<string | undefined> {
    const raw = await this.fetch(ENDPOINT.TR069_AP);
    if (!raw) return undefined;
    const value = this.matchInputValueBySelector(raw, this.s.advTr069Url);
    if (!value) return undefined;
    return value;
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
