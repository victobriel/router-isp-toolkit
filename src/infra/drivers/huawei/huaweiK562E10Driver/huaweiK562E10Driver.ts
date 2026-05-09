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
      wan: function (): Promise<
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
        return Promise.resolve({
          internetEnabled: undefined,
          pppoeUsername: undefined,
          ipVersion: undefined,
          ipAcquisitionMode: undefined,
          requestPdEnabled: undefined,
          slaacEnabled: undefined,
          dhcpv6Enabled: undefined,
          pdEnabled: undefined,
          linkSpeed: undefined,
        });
      },
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
