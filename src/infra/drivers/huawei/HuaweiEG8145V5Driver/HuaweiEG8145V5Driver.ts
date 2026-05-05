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
      wan: async () => {
        return {
          wan: undefined,
          linkSpeed: undefined,
        };
      },
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

    const httpWanRules = this.parseHuaweiStructCallAll(raw, 'stNewDeviceAcl').filter(
      (rule) =>
        rule.SrcPortType === '2' &&
        rule.Mode === '0' &&
        rule.Protocol.toUpperCase()
          .split(',')
          .map((p) => p.trim())
          .includes('HTTP'),
    );

    const hasIpv4Rule = httpWanRules.some((rule) => rule.SrcIp === '' || !rule.SrcIp.includes(':'));

    return {
      remoteAccessIpv4Enabled: aclEnabled && hasIpv4Rule,
      remoteAccessIpv6Enabled: false,
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
