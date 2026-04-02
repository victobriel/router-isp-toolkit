import { BaseRouter } from '@/infra/router/BaseRouter';
import {
  ExtractionResultSchema,
  type Credentials,
  type ExtractionResult,
  type PingTestResult,
} from '@/domain/schemas/validation';
import type { TopologyBand, TopologyClient } from '@/infra/drivers/shared/types';
import type { ITopologySectionParser } from '@/infra/drivers/shared/TopologySectionParser';
import { IDomGateway } from '@/application/ports/IDomGateway';
import { ButtonConfig } from '@/domain/ports/IRouter.types';
import {
  ExtractionFilter,
  GoToPageOptions,
  RouterPage,
  RouterPageKey,
  RouterSelectors,
} from '@/application/types';

type ZteTimeouts = {
  dhcpLanAllocatedAddressMaxWaitMs: number;
  topologyClientsLoadMaxWaitMs: number;
  topologyPopupSettleMs: number;
};

enum ZteGoToPageTargetAction {
  CLICK = 'click',
  FOCUS = 'focus',
}

type ZteGoToPagePlan = {
  steps: (string | null)[];
  targetSelector: string;
  targetAction?: ZteGoToPageTargetAction;
  expandToggleSelector?: string;
  expandedAreaSelector?: string;
};

export abstract class ZteBaseDriver extends BaseRouter {
  protected readonly s: RouterSelectors;
  protected readonly topologyParser: ITopologySectionParser;
  protected readonly timeouts: ZteTimeouts;

  protected constructor(
    model: string,
    selectors: RouterSelectors,
    topologyParser: ITopologySectionParser,
    domService: IDomGateway,
    timeouts: ZteTimeouts,
  ) {
    super(model, domService, selectors);
    this.s = selectors;
    this.topologyParser = topologyParser;
    this.timeouts = timeouts;
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

  protected async extractTopologyData(): Promise<Pick<ExtractionResult, 'topology'>> {
    const clientsByBand: Record<TopologyBand, TopologyClient[]> = {
      '24ghz': [],
      '5ghz': [],
      cable: [],
    };

    await this.stepByStepNavigate([this.s.topologyTab, this.s.allClientsSection]);

    const routers = Array.from(
      document.querySelectorAll<SVGCircleElement>(this.s.topologyRouterCircles),
    ).filter((el) => el instanceof SVGCircleElement) as SVGCircleElement[];

    for (const router of routers) {
      router.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      await this.waitForElement(this.s.topologyPopup);

      await Promise.race([
        this.waitForElement(
          this.s.topologyPopupWaitRows,
          this.timeouts.topologyClientsLoadMaxWaitMs,
        ),
        this.delay(this.timeouts.topologyPopupSettleMs),
      ]).catch(() => {});

      const popup = this.domService.getHTMLElement(this.s.topologyPopup, HTMLElement);
      if (!popup) continue;

      const lanSection = this.domService.getHTMLElement(this.s.lanAccessSection, HTMLElement);
      if (lanSection) {
        clientsByBand.cable.push(
          ...this.topologyParser.parse(lanSection, {
            rows: this.s.lanAccessRows,
            hostName: this.s.lanHostName,
            macAddr: this.s.lanMacAddr,
            ipAddr: this.s.lanIpAddr,
          }),
        );
      }

      const wlan2Section = this.domService.getHTMLElement(this.s.wlan2Section, HTMLElement);
      if (wlan2Section) {
        clientsByBand['24ghz'].push(
          ...this.topologyParser.parse(wlan2Section, {
            rows: this.s.wlan2Rows,
            hostName: this.s.wlan2HostName,
            macAddr: this.s.wlan2MacAddr,
            ipAddr: this.s.wlan2IpAddr,
            rssi: this.s.wlan2Rssi,
          }),
        );
      }

      const wlan5Section = this.domService.getHTMLElement(this.s.wlan5Section, HTMLElement);
      if (wlan5Section) {
        clientsByBand['5ghz'].push(
          ...this.topologyParser.parse(wlan5Section, {
            rows: this.s.wlan5Rows,
            hostName: this.s.wlan5HostName,
            macAddr: this.s.wlan5MacAddr,
            ipAddr: this.s.wlan5IpAddr,
            rssi: this.s.wlan5Rssi,
          }),
        );
      }
    }

    const topology: ExtractionResult['topology'] = {
      '24ghz': {
        clients: clientsByBand['24ghz'],
        totalClients: clientsByBand['24ghz'].length,
      },
      '5ghz': {
        clients: clientsByBand['5ghz'],
        totalClients: clientsByBand['5ghz'].length,
      },
      cable: {
        clients: clientsByBand.cable,
        totalClients: clientsByBand.cable.length,
      },
    };

    return { topology };
  }

  private async extractLinkSpeedData(): Promise<Pick<ExtractionResult, 'linkSpeed'>> {
    await this.stepByStepNavigate([this.s.internetTab]);
    await this.expandIfCollapsed(this.s.ethernetInformationContainer, this.s.linkSpeed);
    const linkSpeed = this.domService.getElementValue(this.s.linkSpeed) ?? undefined;
    return { linkSpeed };
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
    await this.stepByStepNavigate([this.s.internetTab, this.s.wanContainer]);

    await this.expandIfCollapsed(this.s.pppoeEntry, this.s.pppoeUsername);

    await Promise.all([
      this.waitForElement(this.s.pppoeUsername),
      this.waitForElement(this.s.serviceListInternet),
      this.waitForElement(this.s.serviceListTr069),
      this.waitForElement(this.s.requestPd),
      this.waitForElement(this.s.slaac),
      this.waitForElement(this.s.dhcpv6),
      this.waitForElement(this.s.pdAddress),
      this.waitForElement(this.s.ipMode),
    ]);

    const pppoeUsername = this.domService.getElementValue(this.s.pppoeUsername) ?? undefined;

    const internetEnabled = this.domService.getHTMLElement(
      this.s.serviceListInternet,
      HTMLInputElement,
    )?.checked;

    const tr069Enabled = this.domService.getHTMLElement(
      this.s.serviceListTr069,
      HTMLInputElement,
    )?.checked;

    const requestPdEnabled = this.domService.getHTMLElement(
      this.s.requestPd,
      HTMLInputElement,
    )?.checked;

    const slaacEnabled = this.domService.getHTMLElement(this.s.slaac, HTMLInputElement)?.checked;

    const dhcpv6Enabled = this.domService.getHTMLElement(this.s.dhcpv6, HTMLInputElement)?.checked;

    const pdEnabled = this.domService.getHTMLElement(this.s.pdAddress, HTMLInputElement)?.checked;

    const ipVersion = this.domService.getElementSelectedOptionText(this.s.ipMode) ?? undefined;

    return {
      internetEnabled,
      tr069Enabled,
      pppoeUsername,
      ipVersion,
      requestPdEnabled,
      slaacEnabled,
      dhcpv6Enabled,
      pdEnabled,
    };
  }

  private async extractRemoteAccessData(): Promise<
    Pick<ExtractionResult, 'remoteAccessIpv4Enabled' | 'remoteAccessIpv6Enabled'>
  > {
    await this.stepByStepNavigate([
      this.s.internetTab,
      this.s.securityContainer,
      this.s.localServiceControl,
    ]);

    await this.expandIfCollapsed(this.s.serviceControlBar, this.s.ipv4RemoteAccessToggle);

    const remoteAccessIpv4Enabled = this.domService.getHTMLElement(
      this.s.ipv4RemoteAccessToggle,
      HTMLInputElement,
    )?.checked;

    await this.expandIfCollapsed(this.s.ipv6ServiceControlBar, this.s.ipv6RemoteAccessToggle);

    const remoteAccessIpv6Enabled = this.domService.getHTMLElement(
      this.s.ipv6RemoteAccessToggle,
      HTMLInputElement,
    )?.checked;

    return {
      remoteAccessIpv4Enabled,
      remoteAccessIpv6Enabled,
    };
  }

  protected async extractBandSteeringData(): Promise<
    Pick<ExtractionResult, 'bandSteeringEnabled'>
  > {
    await this.stepByStepNavigate([
      this.s.localNetworkTab,
      this.s.wlanContainer,
      this.s.bandSteeringContainer,
    ]);

    await this.expandIfCollapsed(this.s.bandSteeringWlanContainer, this.s.bandSteeringEnabled);

    const bandSteeringEnabled = this.domService.getHTMLElement(
      this.s.bandSteeringEnabled,
      HTMLInputElement,
    )?.checked;

    return { bandSteeringEnabled };
  }

  private async extractWlanData(): Promise<
    Pick<
      ExtractionResult,
      'wlan24GhzConfig' | 'wlan5GhzConfig' | 'wlan24GhzSsids' | 'wlan5GhzSsids'
    >
  > {
    await this.stepByStepNavigate([
      this.s.localNetworkTab,
      this.s.wlanContainer,
      this.s.wlanBasicContainer,
    ]);

    await this.expandIfCollapsed(
      this.s.wlanOnOffConfigurationContainer,
      this.s.wlan24GhzRadioStatus,
    );

    await Promise.all([
      this.waitForElement(this.s.wlan24GhzRadioStatus),
      this.waitForElement(this.s.wlan5GhzRadioStatus),
    ]);

    const wlan24GhzConfig = this.domService.getHTMLElement(
      this.s.wlan24GhzRadioStatus,
      HTMLInputElement,
    )?.checked;

    const wlan5GhzConfig = this.domService.getHTMLElement(
      this.s.wlan5GhzRadioStatus,
      HTMLInputElement,
    )?.checked;

    await this.expandIfCollapsed(this.s.wlanGlobalConfigContainer, this.s.wlan24GhzChannel);

    await Promise.all([
      this.waitForElement(this.s.wlan24GhzChannel),
      this.waitForElement(this.s.wlan24GhzMode),
      this.waitForElement(this.s.wlan24GhzBandWidth),
      this.waitForElement(this.s.wlan24GhzTransmittingPower),
    ]);

    const wlan24GhzChannel = this.domService.getElementValue(this.s.wlan24GhzChannel) ?? undefined;
    const wlan24GhzMode =
      this.domService.getElementSelectedOptionText(this.s.wlan24GhzMode) ?? undefined;
    const wlan24GhzBandWidth =
      this.domService.getElementValue(this.s.wlan24GhzBandWidth) ?? undefined;
    const wlan24GhzTransmittingPower =
      this.domService.getElementValue(this.s.wlan24GhzTransmittingPower) ?? undefined;

    await this.expandIfCollapsed(this.s.wlan5GhzGlobalConfigContainer, this.s.wlan5GhzChannel);

    await Promise.all([
      this.waitForElement(this.s.wlan5GhzChannel),
      this.waitForElement(this.s.wlan5GhzMode),
      this.waitForElement(this.s.wlan5GhzBandWidth),
      this.waitForElement(this.s.wlan5GhzTransmittingPower),
    ]);

    const wlan5GhzChannel = this.domService.getElementValue(this.s.wlan5GhzChannel) ?? undefined;
    const wlan5GhzMode =
      this.domService.getElementSelectedOptionText(this.s.wlan5GhzMode) ?? undefined;
    const wlan5GhzBandWidth =
      this.domService.getElementValue(this.s.wlan5GhzBandWidth) ?? undefined;
    const wlan5GhzTransmittingPower =
      this.domService.getElementValue(this.s.wlan5GhzTransmittingPower) ?? undefined;

    await this.expandIfCollapsed(this.s.wlanSsidConfigContainer, this.s.wlan24GhzSsidName);

    const wlan24GhzSsids = await this.extractMultiSsidConfigs(0, 4);
    const wlan5GhzSsids = await this.extractMultiSsidConfigs(4, 4);

    return {
      wlan24GhzConfig: {
        enabled: wlan24GhzConfig,
        channel: wlan24GhzChannel,
        mode: wlan24GhzMode,
        bandWidth: wlan24GhzBandWidth,
        transmittingPower: wlan24GhzTransmittingPower,
      },
      wlan5GhzConfig: {
        enabled: wlan5GhzConfig,
        channel: wlan5GhzChannel,
        mode: wlan5GhzMode,
        bandWidth: wlan5GhzBandWidth,
        transmittingPower: wlan5GhzTransmittingPower,
      },
      wlan24GhzSsids,
      wlan5GhzSsids,
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
    await this.stepByStepNavigate([this.s.localNetworkTab, this.s.lanContainer]);

    await this.expandIfCollapsed(this.s.dhcpServerContainer, this.s.dhcpEnabled);

    await Promise.all([
      this.waitForDhcpValue('dhcpIpAddress', this.s.dhcpIpAddressField1).catch(() => {}),
      this.waitForDhcpValue('dhcpSubnetMask', this.s.dhcpSubnetMaskField1).catch(() => {}),
      this.waitForDhcpValue('dhcpStartIp', this.s.dhcpStartIpField1).catch(() => {}),
      this.waitForDhcpValue('dhcpEndIp', this.s.dhcpEndIpField1).catch(() => {}),
    ]);

    const dhcpEnabled = this.domService.getHTMLElement(
      this.s.dhcpEnabled,
      HTMLInputElement,
    )?.checked;

    const dhcpIpAddress = this.readDhcpValue('dhcpIpAddress', 'dhcpIpAddressField');

    const dhcpSubnetMask = this.readDhcpValue('dhcpSubnetMask', 'dhcpSubnetMaskField');

    const dhcpStartIp = this.readDhcpValue('dhcpStartIp', 'dhcpStartIpField');

    const dhcpEndIp = this.readDhcpValue('dhcpEndIp', 'dhcpEndIpField');

    const dhcpIspDnsEnabled = this.domService.getHTMLElement(
      this.s.dhcpIspDnsEnabled,
      HTMLInputElement,
    )?.checked;

    let dhcpPrimaryDns = '';
    let dhcpSecondaryDns = '';
    if (!dhcpIspDnsEnabled) {
      await Promise.all([
        this.waitForDhcpValue('dhcpPrimaryDns', this.s.dhcpPrimaryDnsField1).catch(() => {}),
        this.waitForDhcpValue('dhcpSecondaryDns', this.s.dhcpSecondaryDnsField1).catch(() => {}),
      ]);
      dhcpPrimaryDns = this.readDhcpValue('dhcpPrimaryDns', 'dhcpPrimaryDnsField');
      dhcpSecondaryDns = this.readDhcpValue('dhcpSecondaryDns', 'dhcpSecondaryDnsField');
    }

    const dhcpLeaseTimeModeValue =
      this.domService.getElementValue(this.s.dhcpLeaseTimeMode) ?? undefined;
    const dhcpLeaseTime =
      dhcpLeaseTimeModeValue !== 'Infinity'
        ? (this.readSingleValueSelector('dhcpLeaseTimeValue') ??
          this.domService.getElementValue(this.s.dhcpLeaseTime) ??
          '')
        : 'Infinity';
    const dhcpLeaseTimeMode =
      this.domService.getElementSelectedOptionText(this.s.dhcpLeaseTimeMode) ?? undefined;

    return {
      dhcpEnabled,
      dhcpIpAddress,
      dhcpSubnetMask,
      dhcpStartIp,
      dhcpEndIp,
      dhcpIspDnsEnabled,
      dhcpPrimaryDns: dhcpIspDnsEnabled ? 'Auto' : dhcpPrimaryDns,
      dhcpSecondaryDns: dhcpIspDnsEnabled ? 'Auto' : dhcpSecondaryDns,
      dhcpLeaseTimeMode: dhcpLeaseTimeMode,
      dhcpLeaseTime: dhcpLeaseTime,
    };
  }

  private async extractUpnpData(): Promise<Pick<ExtractionResult, 'upnpEnabled'>> {
    await this.stepByStepNavigate([this.s.localNetworkTab, this.s.upnpContainer]);

    await this.expandIfCollapsed(this.s.upnpContainerPage, this.s.upnpEnabled);

    const upnpEnabled = this.domService.getHTMLElement(
      this.s.upnpEnabled,
      HTMLInputElement,
    )?.checked;

    return {
      upnpEnabled,
    };
  }

  private async extractRouterVersionData(): Promise<
    Pick<ExtractionResult, 'routerModel' | 'routerVersion'>
  > {
    await this.stepByStepNavigate([this.s.managementTab, this.s.routerVersionContainer]);

    await this.expandIfCollapsed(this.s.managementContainerPage, this.s.routerVersion);

    const routerVersion = this.domService.getElementValue(this.s.routerVersion)?.trim();
    const routerModel = this.domService.getElementValue(this.s.routerModel)?.trim();

    return { routerModel, routerVersion };
  }

  private async extractTr069UrlData(): Promise<Pick<ExtractionResult, 'tr069Url'>> {
    await this.stepByStepNavigate([this.s.managementTab, this.s.tr069UrlContainer]);

    await this.expandIfCollapsed(this.s.tr069UrlContainerPage, this.s.tr069Url);

    await this.waitForInputPopulated(this.s.tr069Url).catch(() => {});

    const tr069Url = this.domService.getElementValue(this.s.tr069Url)?.trim();

    return { tr069Url };
  }

  private goToHomePage(): boolean {
    this.domService.safeClick(this.s.homeTab);
    return true;
  }

  private async extractMultiSsidConfigs(
    startIndex: number,
    count: number,
  ): Promise<ExtractionResult['wlan24GhzSsids'] | ExtractionResult['wlan5GhzSsids']> {
    const results: ExtractionResult['wlan24GhzSsids'] | ExtractionResult['wlan5GhzSsids'] = [];

    for (let offset = 0; offset < count; offset++) {
      const index = startIndex + offset;

      const ssidNameSelector = `${this.s.wlanSsidName}${index}`;
      const ssidName = this.domService.getElementValue(ssidNameSelector)?.trim() ?? undefined;

      const enabledSelector = `${this.s.wlan24GhzSsidEnabled}${index}`;
      const enabled = this.domService.getHTMLElement(enabledSelector, HTMLInputElement)?.checked;

      await this.clickElementAndWait(`${this.s.wlanShowPasswordButton}${index}`);

      const passwordSelector = `${this.s.wlanSsidPassword}${index}`;

      await this.waitForInputPopulated(passwordSelector).catch(() => {});

      const ssidPassword = this.domService.getElementValue(passwordSelector)?.trim() ?? undefined;

      const hideModeInputSelector = `${this.s.wlanSsidHideMode}${index}`;
      const ssidHideMode = this.domService.getHTMLElement(
        hideModeInputSelector,
        HTMLInputElement,
      )?.checked;

      const wpa2SecuritySelector = `${this.s.wlanSsidWpa2SecurityType}${index}`;
      const wpa2SecurityType =
        this.domService.getElementSelectedOptionText(wpa2SecuritySelector) ?? undefined;

      const maxClientsSelector = `${this.s.wlanSsidMaxClients}${index}`;
      const maxClientsRaw = this.domService.getElementValue(maxClientsSelector) ?? undefined;
      const maxClients = Number(maxClientsRaw);

      results.push({
        enabled,
        ssidName,
        ssidPassword,
        ssidHideMode,
        wpa2SecurityType,
        maxClients,
      });
    }

    return results;
  }

  private readDhcpOctetFields(
    prefix:
      | 'dhcpIpAddressField'
      | 'dhcpSubnetMaskField'
      | 'dhcpStartIpField'
      | 'dhcpEndIpField'
      | 'dhcpPrimaryDnsField'
      | 'dhcpSecondaryDnsField',
  ): (string | undefined)[] {
    const keys = [1, 2, 3, 4].map((i) => `${prefix}${i}`);
    return keys.map((key) => this.domService.getElementValue(this.s[key]) ?? undefined);
  }

  private readDhcpValue(
    singleValueKey:
      | 'dhcpIpAddress'
      | 'dhcpSubnetMask'
      | 'dhcpStartIp'
      | 'dhcpEndIp'
      | 'dhcpPrimaryDns'
      | 'dhcpSecondaryDns',
    octetPrefix:
      | 'dhcpIpAddressField'
      | 'dhcpSubnetMaskField'
      | 'dhcpStartIpField'
      | 'dhcpEndIpField'
      | 'dhcpPrimaryDnsField'
      | 'dhcpSecondaryDnsField',
  ): string {
    const singleValue = this.readSingleValueSelector(singleValueKey);
    if (singleValue) {
      return singleValue;
    }

    return this.readDhcpOctetFields(octetPrefix)
      .filter((value) => value !== undefined)
      .join('.');
  }

  private async waitForDhcpValue(
    key:
      | 'dhcpIpAddress'
      | 'dhcpSubnetMask'
      | 'dhcpStartIp'
      | 'dhcpEndIp'
      | 'dhcpPrimaryDns'
      | 'dhcpSecondaryDns',
    fallbackSelector: string,
  ): Promise<void> {
    const selector = this.getDhcpSingleValueSelector(key);
    if (selector) {
      await this.waitForInputPopulated(selector);
      return;
    }

    await this.waitForInputPopulated(fallbackSelector);
  }

  private readSingleValueSelector(
    key:
      | 'dhcpIpAddress'
      | 'dhcpSubnetMask'
      | 'dhcpStartIp'
      | 'dhcpEndIp'
      | 'dhcpPrimaryDns'
      | 'dhcpSecondaryDns'
      | 'dhcpLeaseTimeValue',
  ): string | undefined {
    const selector = this.getDhcpSingleValueSelector(key);
    if (!selector) {
      return undefined;
    }

    const value = this.domService.getElementValue(selector)?.trim();
    return value ? value : undefined;
  }

  private getDhcpSingleValueSelector(
    key:
      | 'dhcpIpAddress'
      | 'dhcpSubnetMask'
      | 'dhcpStartIp'
      | 'dhcpEndIp'
      | 'dhcpPrimaryDns'
      | 'dhcpSecondaryDns'
      | 'dhcpLeaseTimeValue',
  ): string | undefined {
    const selector = this.s[key];
    if (selector) {
      return selector;
    }

    const fallbackSelectors: Record<typeof key, string[]> = {
      dhcpIpAddress: ['#IPAddr\\:DHCPBasicCfg'],
      dhcpSubnetMask: ['#SubnetMask', '#SubMask'],
      dhcpStartIp: ['#MinAddress\\:DHCPBasicCfg'],
      dhcpEndIp: ['#MaxAddress\\:DHCPBasicCfg'],
      dhcpPrimaryDns: ['#DNSServer1'],
      dhcpSecondaryDns: ['#DNSServer2'],
      dhcpLeaseTimeValue: ['#LeaseTime'],
    };

    return fallbackSelectors[key].find(
      (candidate) => this.domService.getElementValue(candidate)?.trim() !== undefined,
    );
  }

  protected async expandIfCollapsed(toggleSelector: string, targetSelector: string): Promise<void> {
    if (this.isElementActuallyVisible(targetSelector)) {
      return;
    }

    await this.clickElementAndWait(toggleSelector, targetSelector);
  }

  private isElementActuallyVisible(selector: string): boolean {
    const element = this.domService.getHTMLElement(selector, HTMLElement);

    if (!element) {
      return false;
    }

    let current: HTMLElement | null = element;

    while (current) {
      const style = window.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }

      current = current.parentElement;
    }

    return element.getClientRects().length > 0;
  }

  public isAuthenticated(): boolean {
    const internetTab = this.domService.getHTMLElement(this.s.internetTab, HTMLElement);
    const onLoginPage = this.isLoginPage();
    return !onLoginPage && !!internetTab;
  }

  public async ping(ip: string): Promise<PingTestResult | null> {
    await this.stepByStepNavigate([
      this.s.managementTab,
      this.s.diagnosticsContainer,
      this.s.diagnosticsPingContainer,
      this.s.diagnosticsPingIpAddress,
    ]);

    this.domService.updateHTMLElementValue(this.s.diagnosticsPingIpAddress, ip);

    await this.clickElementAndWait(this.s.pingSendButton);
    await this.waitForDisappearance(this.s.pingWaiting, 30000);

    const result = this.domService.getElementValue(this.s.pingResult)?.trim() ?? undefined;
    return result ? this.parsePingTestResult(result, ip) : null;
  }

  public async reboot(): Promise<void> {
    await this.stepByStepNavigate([
      this.s.managementTab,
      this.s.managementContainer,
      this.s.rebootButton,
    ]);

    await this.waitForElement(this.s.rebootConfirmationButton);

    await this.clickElementAndWait(this.s.rebootConfirmationButton);
  }

  public goToPage(page: RouterPage, key: RouterPageKey, options?: GoToPageOptions): void {
    void this.navigateToPageKey(page, key, options);
  }

  private async navigateToPageKey(
    page: RouterPage,
    key: RouterPageKey,
    options?: GoToPageOptions,
  ): Promise<void> {
    const plan = this.getGoToPagePlan(page, key, options);
    if (!plan) return;

    const { steps, targetSelector, targetAction } = plan;

    try {
      for (const step of steps) {
        if (!step) continue;
        await this.clickElementAndWait(step);
      }

      await this.expandCollapsedGoToTargetIfNeeded(plan);

      await this.waitForElement(targetSelector).catch(() => {});

      const el = this.domService.getHTMLElement(targetSelector, HTMLElement);

      if (!el) return;

      switch (targetAction) {
        case ZteGoToPageTargetAction.CLICK:
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
          await this.delay(200);
          if (el instanceof HTMLSelectElement) {
            el.focus();
            const withPicker = el as HTMLSelectElement & { showPicker?: () => void };
            if (typeof withPicker.showPicker === 'function') {
              try {
                withPicker.showPicker();
                return;
              } catch {
                // No user activation or browser policy — fall through to safeClick.
              }
            }
          }

          this.domService.safeClick(targetSelector);
          break;
        default: {
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
          await this.delay(200);
          this.domService.focusElement(targetSelector);
          break;
        }
      }
    } catch {
      // Best-effort navigation; ignore transient UI failures.
    }
  }

  private async expandCollapsedGoToTargetIfNeeded(plan: ZteGoToPagePlan): Promise<void> {
    const { expandToggleSelector, expandedAreaSelector, targetSelector } = plan;
    if (!expandToggleSelector || !expandedAreaSelector) return;

    const expandedArea = document.querySelector<HTMLElement>(expandedAreaSelector);
    const isExpanded =
      expandedArea instanceof HTMLElement &&
      window.getComputedStyle(expandedArea).display !== 'none';

    if (isExpanded) return;

    this.domService.safeClick(expandToggleSelector);
    await this.waitForElement(targetSelector).catch(() => {});
  }

  private getGoToPagePlan(
    page: RouterPage,
    key: RouterPageKey,
    options?: GoToPageOptions,
  ): ZteGoToPagePlan | null {
    const isFiveGhzBand = this.isFiveGhzBand(options?.band);
    const ssidIndex =
      typeof options?.ssidIndex === 'number' ? options.ssidIndex : isFiveGhzBand ? 4 : 0;

    switch (key) {
      case RouterPageKey.PPPOE_USERNAME:
      case RouterPageKey.INTERNET_STATUS:
      case RouterPageKey.TR_069_STATUS:
      case RouterPageKey.IP_VERSION:
      case RouterPageKey.REQUEST_PD_STATUS:
      case RouterPageKey.SLAAC_STATUS:
      case RouterPageKey.DHCPV6_STATUS:
      case RouterPageKey.PD_STATUS:
        return this.planInternetWanPppoe(key);
      case RouterPageKey.LINK_SPEED:
        return {
          steps: [this.s.internetTab],
          targetSelector: this.s.linkSpeed,
        };
      case RouterPageKey.REMOTE_ACCESS_IPV4_STATUS:
        return {
          steps: [this.s.internetTab, this.s.securityContainer, this.s.localServiceControl],
          targetSelector: this.s.ipv4RemoteAccessToggle,
        };
      case RouterPageKey.REMOTE_ACCESS_IPV6_STATUS:
        return {
          steps: [
            this.s.internetTab,
            this.s.securityContainer,
            this.s.localServiceControl,
            this.s.ipv6ServiceControlBar,
          ],
          targetSelector: this.s.ipv6RemoteAccessToggle,
        };
      case RouterPageKey.DHCP_STATUS:
      case RouterPageKey.DHCP_IP_ADDRESS:
      case RouterPageKey.DHCP_SUBNET_MASK:
      case RouterPageKey.DHCP_START_IP:
      case RouterPageKey.DHCP_END_IP:
      case RouterPageKey.DHCP_ISP_DNS_STATUS:
      case RouterPageKey.DHCP_PRIMARY_DNS:
      case RouterPageKey.DHCP_SECONDARY_DNS:
      case RouterPageKey.DHCP_LEASE_TIME_MODE:
      case RouterPageKey.DHCP_LEASE_TIME:
        return this.planDhcpField(key);
      case RouterPageKey.UPDATE:
        return {
          steps: [this.s.managementTab, this.s.managementContainer, this.s.firmwareUpdateContainer],
          targetSelector: this.s.firmwareUpdateFile,
          targetAction: ZteGoToPageTargetAction.CLICK,
        };
      case RouterPageKey.TR_069_URL:
        return {
          steps: [this.s.managementTab, this.s.tr069UrlContainer],
          targetSelector: this.s.tr069Url,
          targetAction: ZteGoToPageTargetAction.FOCUS,
        };
      case RouterPageKey.UPNP_STATUS:
        return {
          steps: [this.s.localNetworkTab, this.s.upnpContainer],
          targetSelector: this.s.upnpEnabled,
          targetAction: ZteGoToPageTargetAction.FOCUS,
        };
      case RouterPageKey.BAND_STEERING_STATUS:
        return {
          steps: [this.s.localNetworkTab, this.s.wlanContainer, this.s.bandSteeringContainer],
          targetSelector: this.s.bandSteeringEnabled,
          targetAction: ZteGoToPageTargetAction.FOCUS,
        };
      case RouterPageKey.WLAN_STATUS:
      case RouterPageKey.WLAN_CHANNEL:
      case RouterPageKey.WLAN_MODE:
      case RouterPageKey.WLAN_BANDWIDTH:
      case RouterPageKey.WLAN_TRANSMITTING_POWER:
        return this.planWlanGlobalRadio(key, isFiveGhzBand);
      case RouterPageKey.WLAN_SSID_STATUS:
      case RouterPageKey.WLAN_SSID_NAME:
      case RouterPageKey.WLAN_SSID_PASSWORD:
      case RouterPageKey.WLAN_SSID_HIDE_MODE_STATUS:
      case RouterPageKey.WLAN_WPA2_SECURITY_TYPE:
      case RouterPageKey.WLAN_MAX_CLIENTS:
        return this.planWlanSsidRow(key, ssidIndex);
      case RouterPageKey.CHANGE_CREDENTIALS:
        return {
          steps: [this.s.managementTab, this.s.accountManagementContainer],
          targetSelector: this.s.oldPasswordField,
          targetAction: ZteGoToPageTargetAction.FOCUS,
        };
      default:
        return this.getFallbackPlanByPage(page);
    }
  }

  private planInternetWanPppoe(
    key:
      | RouterPageKey.PPPOE_USERNAME
      | RouterPageKey.INTERNET_STATUS
      | RouterPageKey.TR_069_STATUS
      | RouterPageKey.IP_VERSION
      | RouterPageKey.REQUEST_PD_STATUS
      | RouterPageKey.SLAAC_STATUS
      | RouterPageKey.DHCPV6_STATUS
      | RouterPageKey.PD_STATUS,
  ): ZteGoToPagePlan {
    const targetByKey = {
      [RouterPageKey.PPPOE_USERNAME]: this.s.pppoeUsername,
      [RouterPageKey.INTERNET_STATUS]: this.s.serviceListInternet,
      [RouterPageKey.TR_069_STATUS]: this.s.serviceListTr069,
      [RouterPageKey.IP_VERSION]: this.s.ipMode,
      [RouterPageKey.REQUEST_PD_STATUS]: this.s.requestPd,
      [RouterPageKey.SLAAC_STATUS]: this.s.slaac,
      [RouterPageKey.DHCPV6_STATUS]: this.s.dhcpv6,
      [RouterPageKey.PD_STATUS]: this.s.pdAddress,
    } as const;

    const targetActionByKey = {
      [RouterPageKey.PPPOE_USERNAME]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.INTERNET_STATUS]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.TR_069_STATUS]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.IP_VERSION]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.REQUEST_PD_STATUS]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.SLAAC_STATUS]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.DHCPV6_STATUS]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.PD_STATUS]: ZteGoToPageTargetAction.FOCUS,
    } as const;

    return {
      steps: [this.s.internetTab, this.s.wanContainer, this.s.pppoeEntry],
      targetSelector: targetByKey[key],
      targetAction: targetActionByKey[key],
    };
  }

  private planDhcpField(
    key:
      | RouterPageKey.DHCP_STATUS
      | RouterPageKey.DHCP_IP_ADDRESS
      | RouterPageKey.DHCP_SUBNET_MASK
      | RouterPageKey.DHCP_START_IP
      | RouterPageKey.DHCP_END_IP
      | RouterPageKey.DHCP_ISP_DNS_STATUS
      | RouterPageKey.DHCP_PRIMARY_DNS
      | RouterPageKey.DHCP_SECONDARY_DNS
      | RouterPageKey.DHCP_LEASE_TIME_MODE
      | RouterPageKey.DHCP_LEASE_TIME,
  ): ZteGoToPagePlan {
    const targetByKey = {
      [RouterPageKey.DHCP_STATUS]: this.s.dhcpEnabled,
      [RouterPageKey.DHCP_IP_ADDRESS]: this.s.dhcpIpAddressField1,
      [RouterPageKey.DHCP_SUBNET_MASK]: this.s.dhcpSubnetMaskField1,
      [RouterPageKey.DHCP_START_IP]: this.s.dhcpStartIpField1,
      [RouterPageKey.DHCP_END_IP]: this.s.dhcpEndIpField1,
      [RouterPageKey.DHCP_ISP_DNS_STATUS]: this.s.dhcpIspDnsEnabled,
      [RouterPageKey.DHCP_PRIMARY_DNS]: this.s.dhcpPrimaryDnsField1,
      [RouterPageKey.DHCP_SECONDARY_DNS]: this.s.dhcpSecondaryDnsField1,
      [RouterPageKey.DHCP_LEASE_TIME_MODE]: this.s.dhcpLeaseTimeMode,
      [RouterPageKey.DHCP_LEASE_TIME]: this.s.dhcpLeaseTime,
    } as const;

    const targetActionByKey = {
      [RouterPageKey.DHCP_STATUS]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.DHCP_IP_ADDRESS]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.DHCP_SUBNET_MASK]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.DHCP_START_IP]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.DHCP_END_IP]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.DHCP_ISP_DNS_STATUS]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.DHCP_PRIMARY_DNS]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.DHCP_SECONDARY_DNS]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.DHCP_LEASE_TIME_MODE]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.DHCP_LEASE_TIME]: ZteGoToPageTargetAction.FOCUS,
    } as const;

    return {
      steps: [this.s.localNetworkTab, this.s.lanContainer, this.s.dhcpServerContainer],
      targetSelector: targetByKey[key],
      targetAction: targetActionByKey[key],
    };
  }

  private planWlanGlobalRadio(
    key:
      | RouterPageKey.WLAN_STATUS
      | RouterPageKey.WLAN_CHANNEL
      | RouterPageKey.WLAN_MODE
      | RouterPageKey.WLAN_BANDWIDTH
      | RouterPageKey.WLAN_TRANSMITTING_POWER,
    isFiveGhzBand: boolean,
  ): ZteGoToPagePlan {
    const pairByKey = {
      [RouterPageKey.WLAN_STATUS]: {
        g24: this.s.wlan24GhzRadioStatus,
        g5: this.s.wlan5GhzRadioStatus,
      },
      [RouterPageKey.WLAN_CHANNEL]: {
        g24: this.s.wlan24GhzChannel,
        g5: this.s.wlan5GhzChannel,
      },
      [RouterPageKey.WLAN_MODE]: {
        g24: this.s.wlan24GhzMode,
        g5: this.s.wlan5GhzMode,
      },
      [RouterPageKey.WLAN_BANDWIDTH]: {
        g24: this.s.wlan24GhzBandWidth,
        g5: this.s.wlan5GhzBandWidth,
      },
      [RouterPageKey.WLAN_TRANSMITTING_POWER]: {
        g24: this.s.wlan24GhzTransmittingPower,
        g5: this.s.wlan5GhzTransmittingPower,
      },
    } as const;

    const targetActionByKey = {
      [RouterPageKey.WLAN_STATUS]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.WLAN_CHANNEL]: ZteGoToPageTargetAction.CLICK,
      [RouterPageKey.WLAN_MODE]: ZteGoToPageTargetAction.CLICK,
      [RouterPageKey.WLAN_BANDWIDTH]: ZteGoToPageTargetAction.CLICK,
      [RouterPageKey.WLAN_TRANSMITTING_POWER]: ZteGoToPageTargetAction.CLICK,
    } as const;

    const pair = pairByKey[key];
    return {
      steps: [
        this.s.localNetworkTab,
        this.s.wlanContainer,
        this.s.wlanBasicContainer,
        this.s.wlanGlobalConfigContainer,
        isFiveGhzBand ? this.s.wlan24GhzGlobalConfigContainer : null,
        isFiveGhzBand ? this.s.wlan5GhzGlobalConfigContainer : null,
      ],
      targetSelector: isFiveGhzBand ? pair.g5 : pair.g24,
      targetAction: targetActionByKey[key],
    };
  }

  private planWlanSsidRow(
    key:
      | RouterPageKey.WLAN_SSID_STATUS
      | RouterPageKey.WLAN_SSID_NAME
      | RouterPageKey.WLAN_SSID_PASSWORD
      | RouterPageKey.WLAN_SSID_HIDE_MODE_STATUS
      | RouterPageKey.WLAN_WPA2_SECURITY_TYPE
      | RouterPageKey.WLAN_MAX_CLIENTS,
    ssidIndex: number,
  ): ZteGoToPagePlan {
    const elementIdByKey = {
      [RouterPageKey.WLAN_SSID_STATUS]: 'Enable1',
      [RouterPageKey.WLAN_SSID_NAME]: 'ESSID',
      [RouterPageKey.WLAN_SSID_PASSWORD]: 'KeyPassphrase',
      [RouterPageKey.WLAN_SSID_HIDE_MODE_STATUS]: 'ESSIDHideEnable0',
      [RouterPageKey.WLAN_WPA2_SECURITY_TYPE]: 'EncryptionType',
      [RouterPageKey.WLAN_MAX_CLIENTS]: 'MaxUserNum',
    } as const;

    const targetActionByKey = {
      [RouterPageKey.WLAN_SSID_STATUS]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.WLAN_SSID_NAME]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.WLAN_SSID_PASSWORD]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.WLAN_SSID_HIDE_MODE_STATUS]: ZteGoToPageTargetAction.FOCUS,
      [RouterPageKey.WLAN_WPA2_SECURITY_TYPE]: ZteGoToPageTargetAction.CLICK,
      [RouterPageKey.WLAN_MAX_CLIENTS]: ZteGoToPageTargetAction.FOCUS,
    } as const;

    return {
      steps: [
        this.s.localNetworkTab,
        this.s.wlanContainer,
        this.s.wlanBasicContainer,
        this.s.wlanSsidConfigContainer,
      ],
      expandToggleSelector: `#instName_WLANSSIDConf\\:${ssidIndex}`,
      expandedAreaSelector: `#changeArea_WLANSSIDConf\\:${ssidIndex}`,
      targetSelector: `#${elementIdByKey[key]}\\:${ssidIndex}`,
      targetAction: targetActionByKey[key],
    };
  }

  private getFallbackPlanByPage(page: RouterPage): ZteGoToPagePlan | null {
    switch (page) {
      case RouterPage.WAN:
        return {
          steps: [this.s.internetTab, this.s.wanContainer],
          targetSelector: this.s.pppoeUsername,
        };
      case RouterPage.REMOTE_ACCESS:
        return {
          steps: [this.s.internetTab, this.s.securityContainer, this.s.localServiceControl],
          targetSelector: this.s.ipv4RemoteAccessToggle,
        };
      case RouterPage.WLAN:
        return {
          steps: [this.s.localNetworkTab, this.s.wlanContainer, this.s.wlanBasicContainer],
          targetSelector: this.s.wlan24GhzRadioStatus,
        };
      case RouterPage.DHCP:
        return {
          steps: [this.s.localNetworkTab, this.s.lanContainer, this.s.dhcpServerContainer],
          targetSelector: this.s.dhcpEnabled,
        };
      case RouterPage.MANAGEMENT:
        return {
          steps: [this.s.managementTab, this.s.routerVersionContainer],
          targetSelector: this.s.routerVersion,
        };
      case RouterPage.TR_069:
        return {
          steps: [this.s.managementTab, this.s.tr069UrlContainer],
          targetSelector: this.s.tr069Url,
        };
      case RouterPage.UPnP:
        return {
          steps: [this.s.localNetworkTab, this.s.upnpContainer],
          targetSelector: this.s.upnpEnabled,
        };
      case RouterPage.BAND_STEERING:
        return {
          steps: [this.s.localNetworkTab, this.s.wlanContainer, this.s.bandSteeringContainer],
          targetSelector: this.s.bandSteeringEnabled,
        };
      default:
        return null;
    }
  }

  private isFiveGhzBand(band?: string): boolean {
    return typeof band === 'string' && band.includes('5');
  }

  public buttonElementConfig(): ButtonConfig | null {
    return {
      targetSelector: '#loginContainer',
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
    };
  }
}
