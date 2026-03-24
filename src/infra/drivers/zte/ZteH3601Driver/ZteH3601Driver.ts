import { BaseRouter } from '@/infra/router/BaseRouter';
import {
  ExtractionResultSchema,
  type Credentials,
  type ExtractionResult,
  type PingTestResult,
} from '@/domain/schemas/validation';
import type { TopologyBand, TopologyClient } from '@/infra/drivers/shared/types';
import {
  DHCP_LAN_ALLOCATED_ADDRESS_MAX_WAIT_MS,
  TOPOLOGY_CLIENTS_LOAD_MAX_WAIT_MS,
  TOPOLOGY_POPUP_SETTLE_MS,
} from '@/infra/drivers/zte/ZteH3601Driver/constants';
import {
  ZteH3601LoginSelectors,
  ZteH3601Selectors as Selectors,
} from '@/infra/drivers/zte/ZteH3601Driver/ZteH3601Selectors';
import type { ITopologySectionParser } from '@/infra/drivers/shared/TopologySectionParser';
import { IDomGateway } from '@/application/ports/IDomGateway';
import { ButtonConfig } from '@/domain/ports/IRouter.types';
import { GoToPageOptions, RouterPage, RouterPageKey } from '@/application/types';

export class ZteH3601Driver extends BaseRouter {
  private readonly s = Selectors;
  private readonly topologyParser: ITopologySectionParser;
  protected readonly loginSelectors = ZteH3601LoginSelectors;

  constructor(topologyParser: ITopologySectionParser, domService: IDomGateway) {
    super('ZTE ZXHN H3601', domService);
    this.topologyParser = topologyParser;
  }

  public authenticate(credentials: Credentials): void {
    const { username, password } = credentials;

    const usernameField = this.domService.getValueElement(this.s.username);
    const passwordField = this.domService.getValueElement(this.s.password);
    const submitButton = this.domService.getElement(this.s.submit, HTMLElement);

    this.domService.updateField(usernameField, username);
    this.domService.updateField(passwordField, password);

    setTimeout(() => this.domService.safeClick(submitButton), 100);
  }

  public async extract(): Promise<ExtractionResult> {
    const data = {
      timestamp: new Date().toISOString(),
      ...(await this.extractTopologyData()),
      ...(await this.extractLinkSpeedData()),
      ...(await this.extractWanData()),
      ...(await this.extractRemoteAccessData()),
      ...(await this.extractBandSteeringData()),
      ...(await this.extractWlanData()),
      ...(await this.extractLanData()),
      ...(await this.extractUpnpData()),
      ...(await this.extractRouterVersionData()),
      ...(await this.extractTr069UrlData()),
      goToHomePage: this.goToHomePage(),
    };

    return ExtractionResultSchema.parse(data);
  }

  private async extractLinkSpeedData(): Promise<Pick<ExtractionResult, 'linkSpeed'>> {
    await this.clickElementAndWait(this.s.internetTab, this.s.linkSpeed);

    const linkSpeed = (this.domService.getOptionalValue(this.s.linkSpeed) ?? '').trim();

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
    await this.clickElementAndWait(this.s.internetTab, this.s.wanContainer);
    await this.clickElementAndWait(this.s.wanContainer, this.s.pppoeEntry);
    await this.clickElementAndWait(this.s.pppoeEntry, this.s.pppoeUsername);

    const pppoeUsername = (this.domService.getOptionalValue(this.s.pppoeUsername) ?? '').trim();
    const internetEnabled = this.domService.getInputElement(this.s.serviceListInternet).checked;
    const tr069Enabled = this.domService.getInputElement(this.s.serviceListTr069).checked;
    const requestPdEnabled = this.domService.getInputElement(this.s.requestPd).checked;
    const slaacEnabled = this.domService.getInputElement(this.s.slaac).checked;
    const dhcpv6Enabled = this.domService.getInputElement(this.s.dhcpv6).checked;
    const pdEnabled = this.domService.getInputElement(this.s.pdAddress).checked;
    const ipVersion = this.domService.getSelectedOptionText(this.s.ipMode) ?? '';

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
    await this.clickElementAndWait(this.s.internetTab, this.s.securityContainer);
    await this.clickElementAndWait(this.s.securityContainer, this.s.localServiceControl);
    await this.clickElementAndWait(this.s.localServiceControl, this.s.serviceControlBar);

    const remoteAccessIpv4Enabled = this.domService.getInputElement(
      this.s.ipv4RemoteAccessToggle,
    ).checked;

    await this.clickElementAndWait(this.s.ipv6ServiceControlBar, this.s.ipv6RemoteAccessToggle);

    const remoteAccessIpv6Enabled = this.domService.getInputElement(
      this.s.ipv6RemoteAccessToggle,
    ).checked;

    return {
      remoteAccessIpv4Enabled,
      remoteAccessIpv6Enabled,
    };
  }

  private async extractTopologyData(): Promise<Pick<ExtractionResult, 'topology'>> {
    await this.clickElementAndWait(this.s.topologyTab, this.s.allClientsSection);

    const clientsByBand: Record<TopologyBand, TopologyClient[]> = {
      '24ghz': [],
      '5ghz': [],
      cable: [],
    };

    const routerCircles = Array.from(
      document.querySelectorAll<SVGCircleElement>(this.s.topologyRouterCircles),
    );

    for (const circle of routerCircles) {
      circle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      await this.waitForElement(this.s.topologyPopup);

      await Promise.race([
        this.waitForElement(this.s.topologyPopupWaitRows, TOPOLOGY_CLIENTS_LOAD_MAX_WAIT_MS),
        this.delay(TOPOLOGY_POPUP_SETTLE_MS),
      ]).catch(() => {});

      const popup = document.querySelector<HTMLElement>(this.s.topologyPopup);
      if (!popup) continue;

      const lanSection = popup.querySelector<HTMLElement>(this.s.lanAccessSection);
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

      const wlan2Section = popup.querySelector<HTMLElement>(this.s.wlan2Section);
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

      const wlan5Section = popup.querySelector<HTMLElement>(this.s.wlan5Section);
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

  private async extractBandSteeringData(): Promise<Pick<ExtractionResult, 'bandSteeringEnabled'>> {
    await this.clickElementAndWait(this.s.localNetworkTab, this.s.wlanContainer);
    await this.clickElementAndWait(this.s.wlanContainer, this.s.bandSteeringContainer);
    await this.clickElementAndWait(this.s.bandSteeringContainer, this.s.bandSteeringEnabled);

    const bandSteeringEnabled = this.domService.getInputElement(this.s.bandSteeringEnabled).checked;

    return { bandSteeringEnabled };
  }

  private async extractWlanData(): Promise<
    Pick<
      ExtractionResult,
      'wlan24GhzConfig' | 'wlan5GhzConfig' | 'wlan24GhzSsids' | 'wlan5GhzSsids'
    >
  > {
    await this.clickElementAndWait(this.s.localNetworkTab, this.s.wlanContainer);
    await this.clickElementAndWait(this.s.wlanContainer, this.s.wlanBasicContainer);
    await this.clickElementAndWait(this.s.wlanBasicContainer, this.s.wlan24GhzRadioStatus);

    const wlan24GhzConfig = {
      enabled: this.domService.getInputElement(this.s.wlan24GhzRadioStatus).checked,
    };
    const wlan5GhzConfig = {
      enabled: this.domService.getInputElement(this.s.wlan5GhzRadioStatus).checked,
    };

    await this.clickElementAndWait(this.s.wlanGlobalConfigContainer, this.s.wlan24GhzChannel);

    const wlan24GhzChannel = this.domService.getOptionalValue(this.s.wlan24GhzChannel);
    const wlan24GhzMode = this.domService.getSelectedOptionText(this.s.wlan24GhzMode);
    const wlan24GhzBandWidth = this.domService.getOptionalValue(this.s.wlan24GhzBandWidth);
    const wlan24GhzTransmittingPower = this.domService.getOptionalValue(
      this.s.wlan24GhzTransmittingPower,
    );

    await this.clickElementAndWait(this.s.wlan5GhzGlobalConfigContainer, this.s.wlan5GhzChannel);

    const wlan5GhzChannel = this.domService.getOptionalValue(this.s.wlan5GhzChannel);
    const wlan5GhzMode = this.domService.getSelectedOptionText(this.s.wlan5GhzMode);
    const wlan5GhzBandWidth = this.domService.getOptionalValue(this.s.wlan5GhzBandWidth);
    const wlan5GhzTransmittingPower = this.domService.getOptionalValue(
      this.s.wlan5GhzTransmittingPower,
    );

    await this.clickElementAndWait(this.s.wlanSsidConfigContainer, this.s.wlan24GhzSsidName);

    await this.clickElementAndWait(this.s.wlan24GhzShowPasswordButton);

    await this.clickElementAndWait(this.s.wlan5GhzSsidConfigContainer, this.s.wlan5GhzSsidName);

    await this.clickElementAndWait(this.s.wlan5GhzShowPasswordButton);

    const wlan24GhzSsids = await this.extractMultiSsidConfigs(0, 4);
    const wlan5GhzSsids = await this.extractMultiSsidConfigs(4, 4);

    return {
      wlan24GhzConfig: {
        enabled: wlan24GhzConfig.enabled,
        channel: wlan24GhzChannel ?? '',
        mode: wlan24GhzMode ?? '',
        bandWidth: wlan24GhzBandWidth ?? '',
        transmittingPower: wlan24GhzTransmittingPower ?? '',
      },
      wlan5GhzConfig: {
        enabled: wlan5GhzConfig.enabled,
        channel: wlan5GhzChannel ?? '',
        mode: wlan5GhzMode ?? '',
        bandWidth: wlan5GhzBandWidth ?? '',
        transmittingPower: wlan5GhzTransmittingPower ?? '',
      },
      wlan24GhzSsids,
      wlan5GhzSsids,
    };
  }

  /**
   * Reads all SSID rows that are currently visible in the SSID configuration
   * table. The H3601 can expose up to 4 SSIDs per band; indices 0–3 are
   * typically 2.4GHz and 4–7 are 5GHz.
   *
   * This helper is intentionally defensive: it skips rows that are not present
   * or have an empty SSID name so that we only surface SSIDs that are actually
   * configured.
   */
  private async extractMultiSsidConfigs(
    startIndex: number,
    count: number,
  ): Promise<ExtractionResult['wlan24GhzSsids'] | ExtractionResult['wlan5GhzSsids']> {
    const results: ExtractionResult['wlan24GhzSsids'] | ExtractionResult['wlan5GhzSsids'] = [];

    for (let offset = 0; offset < count; offset++) {
      const index = startIndex + offset;

      const ssidNameSelector = `#ESSID\\:${index}`;
      const ssidName = this.domService.getOptionalValue(ssidNameSelector) ?? '';
      if (!ssidName.trim()) {
        continue;
      }

      const enabledSelector = `#Enable1\\:${index}`;
      const enabled = this.domService.getInputElement(enabledSelector).checked;

      await this.clickElementAndWait(`#Switch_KeyPassType\\:${index}`);

      const passwordSelector = `#KeyPassphrase\\:${index}`;

      await this.waitForInputPopulated(passwordSelector).catch(() => {});

      const ssidPassword = this.domService.getOptionalValue(passwordSelector) ?? '';

      const hideModeInputSelector = `#ESSIDHideEnable0\\:${index}`;
      const ssidHideMode = this.domService.getInputElement(hideModeInputSelector).checked;

      const wpa2SecuritySelector = `#EncryptionType\\:${index}`;
      const wpa2SecurityType = this.domService.getOptionalValue(wpa2SecuritySelector) ?? '';

      const maxClientsSelector = `#MaxUserNum\\:${index}`;
      const maxClientsRaw = this.domService.getOptionalValue(maxClientsSelector) ?? '';
      const maxClients = Number(maxClientsRaw) || 0;

      results.push({
        enabled,
        ssidName: ssidName.trim(),
        ssidPassword: ssidPassword.trim(),
        ssidHideMode,
        wpa2SecurityType,
        maxClients,
      });
    }

    return results;
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
    await this.clickElementAndWait(this.s.localNetworkTab, this.s.lanContainer);
    await this.clickElementAndWait(
      this.s.lanContainer,
      this.s.dhcpServerContainer,
      DHCP_LAN_ALLOCATED_ADDRESS_MAX_WAIT_MS,
    );
    await this.clickElementAndWait(this.s.dhcpServerContainer, this.s.dhcpEnabled);
    await this.waitForInputPopulated(this.s.dhcpIpAddressField1).catch(() => {});

    await this.delay(500);

    const dhcpEnabled = this.domService.getInputElement(this.s.dhcpEnabled).checked;

    const dhcpIpAddress = this.readDhcpOctetFields('dhcpIpAddressField');
    const dhcpSubnetMask = this.readDhcpOctetFields('dhcpSubnetMaskField');
    const dhcpStartIp = this.readDhcpOctetFields('dhcpStartIpField');
    const dhcpEndIp = this.readDhcpOctetFields('dhcpEndIpField');

    const dhcpIspDnsEnabled = this.domService.getInputElement(this.s.dhcpIspDnsEnabled).checked;

    let dhcpPrimaryDns: (string | null)[] = [];
    let dhcpSecondaryDns: (string | null)[] = [];
    if (!dhcpIspDnsEnabled) {
      dhcpPrimaryDns = this.readDhcpOctetFields('dhcpPrimaryDnsField');
      dhcpSecondaryDns = this.readDhcpOctetFields('dhcpSecondaryDnsField');
    } else {
      dhcpPrimaryDns = ['-'];
      dhcpSecondaryDns = ['-'];
    }

    const dhcpLeaseTimeModeValue = this.domService.getOptionalValue(this.s.dhcpLeaseTimeMode);
    const dhcpLeaseTime =
      dhcpLeaseTimeModeValue !== 'Infinity'
        ? (this.domService.getOptionalValue(this.s.dhcpLeaseTime) ?? '')
        : 'Infinity';
    const dhcpLeaseTimeMode = this.domService.getSelectedOptionText(this.s.dhcpLeaseTimeMode);

    return {
      dhcpEnabled,
      dhcpIpAddress: dhcpIpAddress.join('.'),
      dhcpSubnetMask: dhcpSubnetMask.join('.'),
      dhcpStartIp: dhcpStartIp.join('.'),
      dhcpEndIp: dhcpEndIp.join('.'),
      dhcpIspDnsEnabled,
      dhcpPrimaryDns:
        dhcpPrimaryDns.length > 0
          ? dhcpPrimaryDns[0] !== '-'
            ? dhcpPrimaryDns.join('.')
            : 'Auto'
          : undefined,
      dhcpSecondaryDns:
        dhcpSecondaryDns.length > 0
          ? dhcpSecondaryDns[0] !== '-'
            ? dhcpSecondaryDns.join('.')
            : 'Auto'
          : undefined,
      dhcpLeaseTimeMode: dhcpLeaseTimeMode ?? '',
      dhcpLeaseTime: dhcpLeaseTime ?? '',
    };
  }

  private async extractUpnpData(): Promise<Pick<ExtractionResult, 'upnpEnabled'>> {
    await this.clickElementAndWait(this.s.localNetworkTab, this.s.upnpContainer);
    await this.clickElementAndWait(this.s.upnpContainer, this.s.upnpEnabled);

    const upnpEnabled = this.domService.getInputElement(this.s.upnpEnabled).checked;

    return {
      upnpEnabled,
    };
  }

  private async extractRouterVersionData(): Promise<
    Pick<ExtractionResult, 'routerModel' | 'routerVersion'>
  > {
    await this.clickElementAndWait(this.s.managementTab, this.s.routerVersionContainer);
    await this.clickElementAndWait(this.s.routerVersionContainer, this.s.routerVersion);

    const routerVersion = (this.domService.getOptionalValue(this.s.routerVersion) ?? '').trim();
    const routerModel = (this.domService.getOptionalValue(this.s.routerModel) ?? '').trim();

    return { routerModel, routerVersion };
  }

  private async extractTr069UrlData(): Promise<Pick<ExtractionResult, 'tr069Url'>> {
    await this.clickElementAndWait(this.s.managementTab, this.s.tr069UrlContainer);
    await this.clickElementAndWait(this.s.tr069UrlContainer, this.s.tr069Url);
    await this.waitForInputPopulated(this.s.tr069Url).catch(() => {});

    await this.delay(500);

    const tr069Url = (this.domService.getOptionalValue(this.s.tr069Url) ?? '').trim();

    return { tr069Url };
  }

  private goToHomePage(): boolean {
    const homePage = document.querySelector<HTMLElement>(this.s.homeTab);
    if (!homePage) return false;
    this.domService.safeClick(homePage);
    return true;
  }

  private readDhcpOctetFields(
    prefix:
      | 'dhcpIpAddressField'
      | 'dhcpSubnetMaskField'
      | 'dhcpStartIpField'
      | 'dhcpEndIpField'
      | 'dhcpPrimaryDnsField'
      | 'dhcpSecondaryDnsField',
  ): (string | null)[] {
    const keys = [1, 2, 3, 4].map((i) => `${prefix}${i}` as keyof typeof Selectors);
    return keys.map((key) => this.domService.getOptionalValue(this.s[key] as string) ?? null);
  }

  public isAuthenticated(): boolean {
    const internetTab = document.querySelector(this.s.internetTab);
    const onLoginPage = this.isLoginPage();
    return !onLoginPage && internetTab instanceof HTMLElement;
  }

  public async ping(ip: string): Promise<PingTestResult | null> {
    await this.clickElementAndWait(this.s.managementTab, this.s.diagnosticsContainer);
    await this.clickElementAndWait(this.s.diagnosticsContainer, this.s.diagnosticsPingContainer);
    await this.clickElementAndWait(
      this.s.diagnosticsPingContainer,
      this.s.diagnosticsPingIpAddress,
    );

    this.domService.updateField(
      this.domService.getValueElement(this.s.diagnosticsPingIpAddress),
      ip,
    );

    await this.clickElementAndWait(this.s.pingSendButton);

    await this.waitForDisappearance(this.s.pingWaiting, 30000);

    const result = this.domService.getOptionalValue(this.s.pingResult);

    if (!result) return null;

    const parsedResult = this.parsePingTestResult(result, ip);

    return parsedResult;
  }

  public async reboot(): Promise<void> {
    await this.clickElementAndWait(this.s.managementTab, this.s.managementContainer);
    await this.clickElementAndWait(this.s.managementContainer, this.s.rebootButton);
    await this.clickElementAndWait(this.s.rebootButton, this.s.rebootConfirmationButton);
    const rebootConfirmationButton = this.domService.getElement(
      this.s.rebootConfirmationButton,
      HTMLElement,
    );
    this.domService.safeClick(rebootConfirmationButton);
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

    try {
      for (const step of plan.steps) {
        if (!step) continue;
        await this.clickElementAndWait(step);
      }

      if (plan.expandToggleSelector && plan.expandedAreaSelector) {
        const expandedArea = document.querySelector<HTMLElement>(plan.expandedAreaSelector);
        const isExpanded =
          expandedArea instanceof HTMLElement &&
          window.getComputedStyle(expandedArea).display !== 'none';

        if (!isExpanded) {
          const expander = document.querySelector<HTMLElement>(plan.expandToggleSelector);
          if (expander) {
            this.domService.safeClick(expander);
            await this.waitForElement(plan.targetSelector).catch(() => {});
          }
        }
      }

      const target = document.querySelector<HTMLElement>(plan.targetSelector);
      if (!target) return;

      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.dispatchEvent(new MouseEvent('focus', { bubbles: true, cancelable: true }));

      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
        target.focus();
      }
    } catch {
      // Best-effort navigation; ignore transient UI failures.
    }
  }

  private getGoToPagePlan(
    page: RouterPage,
    key: RouterPageKey,
    options?: GoToPageOptions,
  ): {
    steps: (string | null)[];
    targetSelector: string;
    expandToggleSelector?: string;
    expandedAreaSelector?: string;
  } | null {
    const ssidIndex =
      typeof options?.ssidIndex === 'number'
        ? options.ssidIndex
        : this.isFiveGhzBand(options?.band)
          ? 4
          : 0;

    switch (key) {
      case RouterPageKey.PPPOE_USERNAME:
      case RouterPageKey.INTERNET_STATUS:
      case RouterPageKey.TR_069_STATUS:
      case RouterPageKey.IP_VERSION:
      case RouterPageKey.REQUEST_PD_STATUS:
      case RouterPageKey.SLAAC_STATUS:
      case RouterPageKey.DHCPV6_STATUS:
      case RouterPageKey.PD_STATUS:
        return {
          steps: [this.s.internetTab, this.s.wanContainer, this.s.pppoeEntry],
          targetSelector:
            key === RouterPageKey.PPPOE_USERNAME
              ? this.s.pppoeUsername
              : key === RouterPageKey.INTERNET_STATUS
                ? this.s.serviceListInternet
                : key === RouterPageKey.TR_069_STATUS
                  ? this.s.serviceListTr069
                  : key === RouterPageKey.IP_VERSION
                    ? this.s.ipMode
                    : key === RouterPageKey.REQUEST_PD_STATUS
                      ? this.s.requestPd
                      : key === RouterPageKey.SLAAC_STATUS
                        ? this.s.slaac
                        : key === RouterPageKey.DHCPV6_STATUS
                          ? this.s.dhcpv6
                          : this.s.pdAddress,
        };
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
        return {
          steps: [this.s.localNetworkTab, this.s.lanContainer, this.s.dhcpServerContainer],
          targetSelector:
            key === RouterPageKey.DHCP_STATUS
              ? this.s.dhcpEnabled
              : key === RouterPageKey.DHCP_IP_ADDRESS
                ? this.s.dhcpIpAddressField1
                : key === RouterPageKey.DHCP_SUBNET_MASK
                  ? this.s.dhcpSubnetMaskField1
                  : key === RouterPageKey.DHCP_START_IP
                    ? this.s.dhcpStartIpField1
                    : key === RouterPageKey.DHCP_END_IP
                      ? this.s.dhcpEndIpField1
                      : key === RouterPageKey.DHCP_ISP_DNS_STATUS
                        ? this.s.dhcpIspDnsEnabled
                        : key === RouterPageKey.DHCP_PRIMARY_DNS
                          ? this.s.dhcpPrimaryDnsField1
                          : key === RouterPageKey.DHCP_SECONDARY_DNS
                            ? this.s.dhcpSecondaryDnsField1
                            : key === RouterPageKey.DHCP_LEASE_TIME_MODE
                              ? this.s.dhcpLeaseTimeMode
                              : this.s.dhcpLeaseTime,
        };
      case RouterPageKey.UPDATE:
        return {
          steps: [this.s.managementTab, this.s.managementContainer, this.s.firmwareUpdateContainer],
          targetSelector: this.s.firmwareUpdateFile,
        };
      case RouterPageKey.TR_069_URL:
        return {
          steps: [this.s.managementTab, this.s.tr069UrlContainer],
          targetSelector: this.s.tr069Url,
        };
      case RouterPageKey.UPNP_STATUS:
        return {
          steps: [this.s.localNetworkTab, this.s.upnpContainer],
          targetSelector: this.s.upnpEnabled,
        };
      case RouterPageKey.BAND_STEERING_STATUS:
        return {
          steps: [this.s.localNetworkTab, this.s.wlanContainer, this.s.bandSteeringContainer],
          targetSelector: this.s.bandSteeringEnabled,
        };
      case RouterPageKey.WLAN_STATUS:
      case RouterPageKey.WLAN_CHANNEL:
      case RouterPageKey.WLAN_MODE:
      case RouterPageKey.WLAN_BANDWIDTH:
      case RouterPageKey.WLAN_TRANSMITTING_POWER:
        return {
          steps: [
            this.s.localNetworkTab,
            this.s.wlanContainer,
            this.s.wlanBasicContainer,
            this.s.wlanGlobalConfigContainer,
            this.isFiveGhzBand(options?.band) ? this.s.wlan24GhzGlobalConfigContainer : null,
            this.isFiveGhzBand(options?.band) ? this.s.wlan5GhzGlobalConfigContainer : null,
          ],
          targetSelector:
            key === RouterPageKey.WLAN_STATUS
              ? this.isFiveGhzBand(options?.band)
                ? this.s.wlan5GhzRadioStatus
                : this.s.wlan24GhzRadioStatus
              : key === RouterPageKey.WLAN_CHANNEL
                ? this.isFiveGhzBand(options?.band)
                  ? this.s.wlan5GhzChannel
                  : this.s.wlan24GhzChannel
                : key === RouterPageKey.WLAN_MODE
                  ? this.isFiveGhzBand(options?.band)
                    ? this.s.wlan5GhzMode
                    : this.s.wlan24GhzMode
                  : key === RouterPageKey.WLAN_BANDWIDTH
                    ? this.isFiveGhzBand(options?.band)
                      ? this.s.wlan5GhzBandWidth
                      : this.s.wlan24GhzBandWidth
                    : this.isFiveGhzBand(options?.band)
                      ? this.s.wlan5GhzTransmittingPower
                      : this.s.wlan24GhzTransmittingPower,
        };
      case RouterPageKey.WLAN_SSID_STATUS:
      case RouterPageKey.WLAN_SSID_NAME:
      case RouterPageKey.WLAN_SSID_PASSWORD:
      case RouterPageKey.WLAN_SSID_HIDE_MODE_STATUS:
      case RouterPageKey.WLAN_WPA2_SECURITY_TYPE:
      case RouterPageKey.WLAN_MAX_CLIENTS:
        return {
          steps: [
            this.s.localNetworkTab,
            this.s.wlanContainer,
            this.s.wlanBasicContainer,
            this.s.wlanSsidConfigContainer,
          ],
          expandToggleSelector: `#instName_WLANSSIDConf\\:${ssidIndex}`,
          expandedAreaSelector: `#changeArea_WLANSSIDConf\\:${ssidIndex}`,
          targetSelector:
            key === RouterPageKey.WLAN_SSID_STATUS
              ? `#Enable1\\:${ssidIndex}`
              : key === RouterPageKey.WLAN_SSID_NAME
                ? `#ESSID\\:${ssidIndex}`
                : key === RouterPageKey.WLAN_SSID_PASSWORD
                  ? `#KeyPassphrase\\:${ssidIndex}`
                  : key === RouterPageKey.WLAN_SSID_HIDE_MODE_STATUS
                    ? `#ESSIDHideEnable0\\:${ssidIndex}`
                    : key === RouterPageKey.WLAN_WPA2_SECURITY_TYPE
                      ? `#EncryptionType\\:${ssidIndex}`
                      : `#MaxUserNum\\:${ssidIndex}`,
        };
      default:
        return this.getFallbackPlanByPage(page);
    }
  }

  private getFallbackPlanByPage(
    page: RouterPage,
  ): { steps: string[]; targetSelector: string } | null {
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
      text: 'Get Data Automatically',
      style: `
        position: absolute;
        bottom: 6.5px;
        left: 27px;
        z-index: 10000;
        padding: 8px;
        color: #181717;
        border: none;
        cursor: pointer;
        text-decoration: underline;
        background-color: transparent;
      `,
    };
  }
}
