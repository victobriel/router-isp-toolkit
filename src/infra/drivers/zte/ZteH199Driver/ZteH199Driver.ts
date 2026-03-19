import { BaseRouter } from '@/infra/router/BaseRouter';
import {
  ExtractionResultSchema,
  type ButtonConfig,
  type Credentials,
  type ExtractionResult,
  type PingTestResult,
} from '@/domain/schemas/validation';
import { DomService } from '@/infra/dom/DomService';
import type { TopologyBand, TopologyClient } from '@/infra/drivers/shared/types';
import {
  DHCP_LAN_ALLOCATED_ADDRESS_MAX_WAIT_MS,
  TOPOLOGY_CLIENTS_LOAD_MAX_WAIT_MS,
  TOPOLOGY_POPUP_SETTLE_MS,
} from '@/infra/drivers/zte/ZteH199Driver/constants';
import {
  ZteH199LoginSelectors,
  ZteH199Selectors as Selectors,
} from '@/infra/drivers/zte/ZteH199Driver/ZteH199Selectors';
import type { ITopologySectionParser } from '@/infra/drivers/shared/TopologySectionParser';

export class ZteH199Driver extends BaseRouter {
  private readonly s = Selectors;
  private readonly topologyParser: ITopologySectionParser;
  protected readonly loginSelectors = ZteH199LoginSelectors;

  constructor(topologyParser: ITopologySectionParser) {
    super('ZTE ZXHN H199');
    this.topologyParser = topologyParser;
  }

  public authenticate(credentials: Credentials): void {
    const { username, password } = credentials;

    const usernameField = DomService.getValueElement(this.s.username);
    const passwordField = DomService.getValueElement(this.s.password);
    const submitButton = DomService.getElement(this.s.submit, HTMLElement);

    DomService.updateField(usernameField, username);
    DomService.updateField(passwordField, password);

    setTimeout(() => DomService.safeClick(submitButton), 100);
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

    const linkSpeed = (DomService.getOptionalValue(this.s.linkSpeed) ?? '').trim();

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

    const pppoeUsername = (DomService.getOptionalValue(this.s.pppoeUsername) ?? '').trim();
    const internetEnabled = DomService.getInputElement(this.s.serviceListInternet).checked;
    const tr069Enabled = DomService.getInputElement(this.s.serviceListTr069).checked;
    const requestPdEnabled = DomService.getInputElement(this.s.requestPd).checked;
    const slaacEnabled = DomService.getInputElement(this.s.slaac).checked;
    const dhcpv6Enabled = DomService.getInputElement(this.s.dhcpv6).checked;
    const pdEnabled = DomService.getInputElement(this.s.pdAddress).checked;
    const ipVersion = DomService.getSelectedOptionText(this.s.ipMode);

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

    const remoteAccessIpv4Enabled = DomService.getInputElement(
      this.s.ipv4RemoteAccessToggle,
    ).checked;

    await this.clickElementAndWait(this.s.ipv6ServiceControlBar, this.s.ipv6RemoteAccessToggle);

    const remoteAccessIpv6Enabled = DomService.getInputElement(
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

    const bandSteeringEnabled = DomService.getInputElement(this.s.bandSteeringEnabled).checked;

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
      enabled: DomService.getInputElement(this.s.wlan24GhzRadioStatus).checked,
    };
    const wlan5GhzConfig = {
      enabled: DomService.getInputElement(this.s.wlan5GhzRadioStatus).checked,
    };

    await this.clickElementAndWait(this.s.wlanGlobalConfigContainer, this.s.wlan24GhzChannel);

    const wlan24GhzChannel = DomService.getOptionalValue(this.s.wlan24GhzChannel);
    const wlan24GhzMode = DomService.getSelectedOptionText(this.s.wlan24GhzMode);
    const wlan24GhzBandWidth = DomService.getOptionalValue(this.s.wlan24GhzBandWidth);
    const wlan24GhzTransmittingPower = DomService.getOptionalValue(
      this.s.wlan24GhzTransmittingPower,
    );

    await this.clickElementAndWait(this.s.wlan5GhzGlobalConfigContainer, this.s.wlan5GhzChannel);

    const wlan5GhzChannel = DomService.getOptionalValue(this.s.wlan5GhzChannel);
    const wlan5GhzMode = DomService.getSelectedOptionText(this.s.wlan5GhzMode);
    const wlan5GhzBandWidth = DomService.getOptionalValue(this.s.wlan5GhzBandWidth);
    const wlan5GhzTransmittingPower = DomService.getOptionalValue(this.s.wlan5GhzTransmittingPower);

    await this.clickElementAndWait(this.s.wlanSsidConfigContainer, this.s.wlan24GhzSsidName);

    await this.clickElementAndWait(this.s.wlan24GhzShowPasswordButton);

    await this.clickElementAndWait(this.s.wlan5GhzSsidConfigContainer, this.s.wlan5GhzSsidName);

    await this.clickElementAndWait(this.s.wlan5GhzShowPasswordButton);

    const wlan24GhzSsids = this.extractMultiSsidConfigs(0, 4);
    const wlan5GhzSsids = this.extractMultiSsidConfigs(4, 4);

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
   * table. The H199 can expose up to 4 SSIDs per band; indices 0–3 are
   * typically 2.4GHz and 4–7 are 5GHz.
   *
   * This helper is intentionally defensive: it skips rows that are not present
   * or have an empty SSID name so that we only surface SSIDs that are actually
   * configured.
   */
  private extractMultiSsidConfigs(
    startIndex: number,
    count: number,
  ): ExtractionResult['wlan24GhzSsids'] | ExtractionResult['wlan5GhzSsids'] {
    const results: ExtractionResult['wlan24GhzSsids'] | ExtractionResult['wlan5GhzSsids'] = [];

    for (let offset = 0; offset < count; offset++) {
      const index = startIndex + offset;

      const ssidNameSelector = `#ESSID\\:${index}`;
      const ssidName = DomService.getOptionalValue(ssidNameSelector) ?? '';
      if (!ssidName.trim()) {
        continue;
      }

      const enabledSelector = `#Enable1\\:${index}`;
      const enabled = DomService.getInputElement(enabledSelector).checked;

      const passwordSelector = `#KeyPassphrase\\:${index}`;
      const ssidPassword = DomService.getOptionalValue(passwordSelector) ?? '';

      const hideModeInput = document.querySelector<HTMLInputElement>(
        `#ESSIDHideEnable0\\:${index}`,
      );
      const ssidHideMode = hideModeInput && hideModeInput.checked;

      const wpa2SecuritySelector = `#EncryptionType\\:${index}`;
      const wpa2SecurityType = DomService.getOptionalValue(wpa2SecuritySelector) ?? '';

      const maxClientsSelector = `#MaxUserNum\\:${index}`;
      const maxClientsRaw = DomService.getOptionalValue(maxClientsSelector) ?? '';
      const maxClients = Number(maxClientsRaw) || 0;

      results.push({
        enabled,
        ssidName: ssidName.trim(),
        ssidPassword: ssidPassword.trim(),
        ssidHideMode: ssidHideMode ?? false,
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

    const dhcpEnabled = DomService.getInputElement(this.s.dhcpEnabled).checked;

    const dhcpIpAddress = this.readDhcpOctetFields('dhcpIpAddressField');
    const dhcpSubnetMask = this.readDhcpOctetFields('dhcpSubnetMaskField');
    const dhcpStartIp = this.readDhcpOctetFields('dhcpStartIpField');
    const dhcpEndIp = this.readDhcpOctetFields('dhcpEndIpField');

    const dhcpIspDnsEnabled = DomService.getInputElement(this.s.dhcpIspDnsEnabled).checked;

    let dhcpPrimaryDns: (string | null)[] = [];
    let dhcpSecondaryDns: (string | null)[] = [];
    if (!dhcpIspDnsEnabled) {
      dhcpPrimaryDns = this.readDhcpOctetFields('dhcpPrimaryDnsField');
      dhcpSecondaryDns = this.readDhcpOctetFields('dhcpSecondaryDnsField');
    } else {
      dhcpPrimaryDns = ['-'];
      dhcpSecondaryDns = ['-'];
    }

    const dhcpLeaseTimeModeValue = DomService.getOptionalValue(this.s.dhcpLeaseTimeMode);
    const dhcpLeaseTime =
      dhcpLeaseTimeModeValue !== 'Infinity'
        ? (DomService.getOptionalValue(this.s.dhcpLeaseTime) ?? '')
        : 'Infinity';
    const dhcpLeaseTimeMode = DomService.getSelectedOptionText(this.s.dhcpLeaseTimeMode);

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

    const upnpEnabled = DomService.getInputElement(this.s.upnpEnabled).checked;

    return {
      upnpEnabled,
    };
  }

  private async extractRouterVersionData(): Promise<
    Pick<ExtractionResult, 'routerModel' | 'routerVersion'>
  > {
    await this.clickElementAndWait(this.s.managementTab, this.s.routerVersionContainer);
    await this.clickElementAndWait(this.s.routerVersionContainer, this.s.routerVersion);

    const routerVersion = (DomService.getOptionalValue(this.s.routerVersion) ?? '').trim();
    const routerModel = (DomService.getOptionalValue(this.s.routerModel) ?? '').trim();

    return { routerModel, routerVersion };
  }

  private async extractTr069UrlData(): Promise<Pick<ExtractionResult, 'tr069Url'>> {
    await this.clickElementAndWait(this.s.managementTab, this.s.tr069UrlContainer);
    await this.clickElementAndWait(this.s.tr069UrlContainer, this.s.tr069Url);
    await this.waitForInputPopulated(this.s.tr069Url).catch(() => {});

    await this.delay(500);

    const tr069Url = (DomService.getOptionalValue(this.s.tr069Url) ?? '').trim();

    return { tr069Url };
  }

  private goToHomePage(): boolean {
    const homePage = document.querySelector<HTMLElement>(this.s.homeTab);
    if (!homePage) return false;
    DomService.safeClick(homePage);
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
    return keys.map((key) => DomService.getOptionalValue(this.s[key] as string) ?? null);
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

    DomService.updateField(DomService.getValueElement(this.s.diagnosticsPingIpAddress), ip);

    await this.clickElementAndWait(this.s.pingSendButton);

    await this.waitForDisappearance(this.s.pingWaiting, 30000);

    const result = DomService.getOptionalValue(this.s.pingResult);

    if (!result) return null;

    const parsedResult = this.parsePingTestResult(result, ip);

    return parsedResult;
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
