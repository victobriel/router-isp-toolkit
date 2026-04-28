/* eslint-disable @typescript-eslint/no-unused-vars */
import { IDomGateway } from '@/application/ports/IDomGateway';
import { ExtractionFilter, RouterPage, RouterPageKey, RouterSelectors } from '@/application/types';
import { ButtonConfig } from '@/domain/ports/IRouter.types';
import {
  Credentials,
  ExtractionResult,
  ExtractionResultSchema,
  PingTestResult,
} from '@/domain/schemas/validation';
import { type TopologyBand, type TopologyClient } from '@/infra/drivers/shared/types';
import { BaseRouter } from '@/infra/router/BaseRouter';
import { ITopologySectionParser } from '../../shared/TopologySectionParser';

export abstract class HuaweiBaseDriver extends BaseRouter {
  protected readonly s: RouterSelectors;
  protected readonly topologyParser: ITopologySectionParser;

  protected constructor(
    model: string,
    selectors: RouterSelectors,
    topologyParser: ITopologySectionParser,
    domService: IDomGateway,
  ) {
    super(model, domService, selectors);
    this.s = selectors;
    this.topologyParser = topologyParser;
  }

  public authenticate(credentials: Credentials): void {
    const { username, password } = credentials;

    this.domService.updateHTMLElementValue(this.s.username, username);
    this.domService.updateHTMLElementValue(this.s.password, password);

    setTimeout(() => this.domService.safeClick(this.s.submit), 100);
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

  public isAuthenticated(): boolean {
    const $homeTab = this.domService.getHTMLElement(this.s.homeTab, HTMLElement);
    const onLoginPage = this.isLoginPage();
    return !onLoginPage && !!$homeTab;
  }

  public ping(ip: string): Promise<PingTestResult | null> {
    throw new Error('Method not implemented.');
  }

  public reboot(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  public goToPage(page: RouterPage, key: RouterPageKey): void {
    throw new Error('Method not implemented.');
  }

  protected async extractTopologyData(): Promise<Pick<ExtractionResult, 'topology'>> {
    return {
      topology: {
        '24ghz': { clients: [], totalClients: 0 },
        '5ghz': { clients: [], totalClients: 0 },
        cable: { clients: [], totalClients: 0 },
      },
    };
  }

  protected async extractBandSteeringData(): Promise<
    Pick<ExtractionResult, 'bandSteeringEnabled'>
  > {
    return { bandSteeringEnabled: undefined };
  }

  private async extractLinkSpeedData(): Promise<Pick<ExtractionResult, 'linkSpeed'>> {
    return { linkSpeed: undefined };
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
    return {
      internetEnabled: undefined,
      tr069Enabled: undefined,
      pppoeUsername: undefined,
      ipVersion: undefined,
      requestPdEnabled: undefined,
      slaacEnabled: undefined,
      dhcpv6Enabled: undefined,
      pdEnabled: undefined,
    };
  }

  private async extractRemoteAccessData(): Promise<
    Pick<ExtractionResult, 'remoteAccessIpv4Enabled' | 'remoteAccessIpv6Enabled'>
  > {
    return {
      remoteAccessIpv4Enabled: undefined,
      remoteAccessIpv6Enabled: undefined,
    };
  }

  private async extractWlanData(): Promise<
    Pick<
      ExtractionResult,
      'wlan24GhzConfig' | 'wlan5GhzConfig' | 'wlan24GhzSsids' | 'wlan5GhzSsids'
    >
  > {
    return {
      wlan24GhzConfig: undefined,
      wlan5GhzConfig: undefined,
      wlan24GhzSsids: undefined,
      wlan5GhzSsids: undefined,
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
    return {
      dhcpEnabled: undefined,
      dhcpIpAddress: undefined,
      dhcpSubnetMask: undefined,
      dhcpStartIp: undefined,
      dhcpEndIp: undefined,
      dhcpIspDnsEnabled: undefined,
      dhcpPrimaryDns: undefined,
      dhcpSecondaryDns: undefined,
      dhcpLeaseTimeMode: undefined,
      dhcpLeaseTime: undefined,
    };
  }

  private async extractUpnpData(): Promise<Pick<ExtractionResult, 'upnpEnabled'>> {
    return { upnpEnabled: undefined };
  }

  private async extractRouterVersionData(): Promise<Pick<ExtractionResult, 'routerVersion'>> {
    return { routerVersion: undefined };
  }

  private async extractTr069UrlData(): Promise<Pick<ExtractionResult, 'tr069Url'>> {
    return { tr069Url: undefined };
  }

  private goToHomePage(): boolean {
    this.domService.safeClick(this.s.homeTab);
    return true;
  }
}
