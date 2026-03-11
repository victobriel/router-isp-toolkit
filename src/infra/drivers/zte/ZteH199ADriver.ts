import { BaseRouter } from "../../router/BaseRouter.js";
import {
  ExtractionResultSchema,
  type ButtonConfig,
  type Credentials,
  type ExtractionResult,
} from "../../../domain/schemas/validation.js";
import { DomService } from "../../dom/DomService.js";
import type { TopologyBand, TopologyClient } from "../shared/types.js";
import {
  DHCP_CONTAINER_WAIT_MS,
  TOPOLOGY_POPUP_SETTLE_MS,
  TOPOLOGY_POPUP_WAIT_MS,
} from "./constants.js";
import {
  ZteH199ALoginSelectors,
  ZteH199ASelectors as Selectors,
} from "./ZteH199ASelectors.js";
import type { ITopologySectionParser } from "../shared/TopologySectionParser.js";

export class ZteH199ADriver extends BaseRouter {
  private readonly s = Selectors;
  private readonly topologyParser: ITopologySectionParser;

  protected readonly loginSelectors = ZteH199ALoginSelectors;

  constructor(topologyParser: ITopologySectionParser) {
    super("ZTE ZXHN H199A");
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
    };

    return ExtractionResultSchema.parse(data);
  }

  private async extractLinkSpeedData(): Promise<
    Pick<ExtractionResult, "linkSpeed">
  > {
    await this.clickElementAndWait(this.s.internetTab, this.s.linkSpeed);

    const linkSpeed = (
      DomService.getOptionalValue(this.s.linkSpeed) ?? ""
    ).trim();

    return { linkSpeed };
  }

  private async extractWanData(): Promise<
    Pick<
      ExtractionResult,
      | "internetEnabled"
      | "tr069Enabled"
      | "pppoeUsername"
      | "ipVersion"
      | "requestPdEnabled"
      | "slaacEnabled"
      | "dhcpv6Enabled"
      | "pdEnabled"
    >
  > {
    await this.clickElementAndWait(this.s.internetTab, this.s.wanContainer);
    await this.clickElementAndWait(this.s.wanContainer, this.s.pppoeEntry);
    await this.clickElementAndWait(this.s.pppoeEntry, this.s.pppoeUsername);

    const pppoeUsername = (
      DomService.getOptionalValue(this.s.pppoeUsername) ?? ""
    ).trim();
    const internetEnabled = DomService.getInputElement(
      this.s.serviceListInternet
    ).checked;
    const tr069Enabled = DomService.getInputElement(
      this.s.serviceListTr069
    ).checked;
    const requestPdEnabled = DomService.getInputElement(
      this.s.requestPd
    ).checked;
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
    Pick<
      ExtractionResult,
      "remoteAccessIpv4Enabled" | "remoteAccessIpv6Enabled"
    >
  > {
    await this.clickElementAndWait(
      this.s.internetTab,
      this.s.securityContainer
    );
    await this.clickElementAndWait(
      this.s.securityContainer,
      this.s.localServiceControl
    );
    await this.clickElementAndWait(
      this.s.localServiceControl,
      this.s.serviceControlBar
    );

    const remoteAccessIpv4Enabled = DomService.getInputElement(
      this.s.ipv4RemoteAccessToggle
    ).checked;

    await this.clickElementAndWait(
      this.s.ipv6ServiceControlBar,
      this.s.ipv6RemoteAccessToggle
    );

    const remoteAccessIpv6Enabled = DomService.getInputElement(
      this.s.ipv6RemoteAccessToggle
    ).checked;

    return {
      remoteAccessIpv4Enabled,
      remoteAccessIpv6Enabled,
    };
  }

  private async extractTopologyData(): Promise<
    Pick<ExtractionResult, "topology">
  > {
    await this.clickElementAndWait(
      this.s.topologyTab,
      this.s.allClientsSection
    );

    const clientsByBand: Record<TopologyBand, TopologyClient[]> = {
      "24ghz": [],
      "5ghz": [],
      cable: [],
    };

    const routerCircles = Array.from(
      document.querySelectorAll<SVGCircleElement>(this.s.topologyRouterCircles)
    );

    for (const circle of routerCircles) {
      circle.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );

      await this.waitForElement(this.s.topologyPopup);

      await Promise.race([
        this.waitForElement(
          this.s.topologyPopupWaitRows,
          TOPOLOGY_POPUP_WAIT_MS
        ),
        this.delay(TOPOLOGY_POPUP_SETTLE_MS),
      ]).catch(() => {});

      const popup = document.querySelector<HTMLElement>(this.s.topologyPopup);
      if (!popup) continue;

      const lanSection = popup.querySelector<HTMLElement>(
        this.s.lanAccessSection
      );
      if (lanSection) {
        clientsByBand.cable.push(
          ...this.topologyParser.parse(lanSection, {
            rows: this.s.lanAccessRows,
            hostName: this.s.lanHostName,
            macAddr: this.s.lanMacAddr,
            ipAddr: this.s.lanIpAddr,
          })
        );
      }

      const wlan2Section = popup.querySelector<HTMLElement>(
        this.s.wlan2Section
      );
      if (wlan2Section) {
        clientsByBand["24ghz"].push(
          ...this.topologyParser.parse(wlan2Section, {
            rows: this.s.wlan2Rows,
            hostName: this.s.wlan2HostName,
            macAddr: this.s.wlan2MacAddr,
            ipAddr: this.s.wlan2IpAddr,
            rssi: this.s.wlan2Rssi,
          })
        );
      }

      const wlan5Section = popup.querySelector<HTMLElement>(
        this.s.wlan5Section
      );
      if (wlan5Section) {
        clientsByBand["5ghz"].push(
          ...this.topologyParser.parse(wlan5Section, {
            rows: this.s.wlan5Rows,
            hostName: this.s.wlan5HostName,
            macAddr: this.s.wlan5MacAddr,
            ipAddr: this.s.wlan5IpAddr,
            rssi: this.s.wlan5Rssi,
          })
        );
      }
    }

    const topology: ExtractionResult["topology"] = {
      "24ghz": { clients: clientsByBand["24ghz"] },
      "5ghz": { clients: clientsByBand["5ghz"] },
      cable: { clients: clientsByBand.cable },
    };

    return { topology };
  }

  private async extractBandSteeringData(): Promise<
    Pick<ExtractionResult, "bandSteeringEnabled">
  > {
    await this.clickElementAndWait(
      this.s.localNetworkTab,
      this.s.wlanContainer
    );
    await this.clickElementAndWait(
      this.s.wlanContainer,
      this.s.bandSteeringContainer
    );
    await this.clickElementAndWait(
      this.s.bandSteeringContainer,
      this.s.bandSteeringEnabled
    );

    const bandSteeringEnabled = DomService.getInputElement(
      this.s.bandSteeringEnabled
    ).checked;

    return { bandSteeringEnabled };
  }

  private async extractWlanData(): Promise<
    Pick<ExtractionResult, "wlan24GhzConfig" | "wlan5GhzConfig">
  > {
    await this.clickElementAndWait(
      this.s.localNetworkTab,
      this.s.wlanContainer
    );
    await this.clickElementAndWait(
      this.s.wlanContainer,
      this.s.wlanBasicContainer
    );
    await this.clickElementAndWait(
      this.s.wlanBasicContainer,
      this.s.wlan24GhzRadioStatus
    );

    const wlan24GhzConfig = {
      enabled: DomService.getInputElement(this.s.wlan24GhzRadioStatus).checked,
    };
    const wlan5GhzConfig = {
      enabled: DomService.getInputElement(this.s.wlan5GhzRadioStatus).checked,
    };

    await this.clickElementAndWait(
      this.s.wlanGlobalConfigContainer,
      this.s.wlan24GhzChannel
    );

    const wlan24GhzChannel = DomService.getOptionalValue(
      this.s.wlan24GhzChannel
    );
    const wlan24GhzMode = DomService.getSelectedOptionText(
      this.s.wlan24GhzMode
    );
    const wlan24GhzBandWidth = DomService.getOptionalValue(
      this.s.wlan24GhzBandWidth
    );
    const wlan24GhzTransmittingPower = DomService.getOptionalValue(
      this.s.wlan24GhzTransmittingPower
    );

    await this.clickElementAndWait(
      this.s.wlan5GhzGlobalConfigContainer,
      this.s.wlan5GhzChannel
    );

    const wlan5GhzChannel = DomService.getOptionalValue(this.s.wlan5GhzChannel);
    const wlan5GhzMode = DomService.getSelectedOptionText(this.s.wlan5GhzMode);
    const wlan5GhzBandWidth = DomService.getOptionalValue(
      this.s.wlan5GhzBandWidth
    );
    const wlan5GhzTransmittingPower = DomService.getOptionalValue(
      this.s.wlan5GhzTransmittingPower
    );

    await this.clickElementAndWait(
      this.s.wlanSsidConfigContainer,
      this.s.wlan24GhzSsidName
    );

    const wlan24GhzSsidName = DomService.getOptionalValue(
      this.s.wlan24GhzSsidName
    );
    const wlan24GhzSsidHideMode = DomService.getInputElement(
      this.s.wlan24GhzSsidHideMode
    ).checked;
    const wlan24GhzSsidWpa2SecurityType = DomService.getOptionalValue(
      this.s.wlan24GhzSsidWpa2SecurityType
    );
    const wlan24GhzSsidMaxClients = DomService.getOptionalValue(
      this.s.wlan24GhzSsidMaxClients
    );

    await this.clickElementAndWait(this.s.wlan24GhzShowPasswordButton);
    const showPassword24Ghz = DomService.getInputElement(
      this.s.wlan24GhzShowPasswordButton
    ).checked;
    let wlan24GhzSsidPassword = "";
    if (showPassword24Ghz) {
      wlan24GhzSsidPassword = (
        DomService.getOptionalValue(this.s.wlan24GhzSsidPassword) ?? ""
      ).trim();
    }

    await this.clickElementAndWait(
      this.s.wlan5GhzSsidConfigContainer,
      this.s.wlan5GhzSsidName
    );

    const wlan5GhzSsidName = DomService.getOptionalValue(
      this.s.wlan5GhzSsidName
    );
    const wlan5GhzSsidHideMode = DomService.getInputElement(
      this.s.wlan5GhzSsidHideMode
    ).checked;
    const wlan5GhzSsidWpa2SecurityType = DomService.getOptionalValue(
      this.s.wlan5GhzSsidWpa2SecurityType
    );
    const wlan5GhzSsidMaxClients = DomService.getOptionalValue(
      this.s.wlan5GhzSsidMaxClients
    );

    await this.clickElementAndWait(this.s.wlan5GhzShowPasswordButton);
    const showPassword5Ghz = DomService.getInputElement(
      this.s.wlan5GhzShowPasswordButton
    ).checked;
    let wlan5GhzSsidPassword = "";
    if (showPassword5Ghz) {
      wlan5GhzSsidPassword = (
        DomService.getOptionalValue(this.s.wlan5GhzSsidPassword) ?? ""
      ).trim();
    }

    return {
      wlan24GhzConfig: {
        enabled: wlan24GhzConfig.enabled,
        channel: Number(wlan24GhzChannel),
        mode: wlan24GhzMode ?? "",
        bandWidth: wlan24GhzBandWidth ?? "",
        transmittingPower: wlan24GhzTransmittingPower ?? "",
        ssidName: wlan24GhzSsidName ?? "",
        ssidHideMode: wlan24GhzSsidHideMode ? "Hidden" : "Visible",
        wpa2SecurityType: wlan24GhzSsidWpa2SecurityType ?? "",
        maxClients: Number(wlan24GhzSsidMaxClients),
        ssidPassword: wlan24GhzSsidPassword,
      },
      wlan5GhzConfig: {
        enabled: wlan5GhzConfig.enabled,
        channel: Number(wlan5GhzChannel),
        mode: wlan5GhzMode ?? "",
        bandWidth: wlan5GhzBandWidth ?? "",
        transmittingPower: wlan5GhzTransmittingPower ?? "",
        ssidName: wlan5GhzSsidName ?? "",
        ssidHideMode: wlan5GhzSsidHideMode ? "Hidden" : "Visible",
        wpa2SecurityType: wlan5GhzSsidWpa2SecurityType ?? "",
        maxClients: Number(wlan5GhzSsidMaxClients),
        ssidPassword: wlan5GhzSsidPassword,
      },
    };
  }

  private async extractLanData(): Promise<
    Pick<
      ExtractionResult,
      | "dhcpEnabled"
      | "dhcpIpAddress"
      | "dhcpSubnetMask"
      | "dhcpStartIp"
      | "dhcpEndIp"
      | "dhcpIspDnsEnabled"
      | "dhcpPrimaryDns"
      | "dhcpSecondaryDns"
      | "dhcpLeaseTimeMode"
      | "dhcpLeaseTime"
    >
  > {
    await this.clickElementAndWait(this.s.localNetworkTab, this.s.lanContainer);
    await this.clickElementAndWait(
      this.s.lanContainer,
      this.s.dhcpServerContainer,
      DHCP_CONTAINER_WAIT_MS
    );
    await this.clickElementAndWait(
      this.s.dhcpServerContainer,
      this.s.dhcpEnabled
    );

    const dhcpEnabled = DomService.getInputElement(this.s.dhcpEnabled).checked;

    const dhcpIpAddress = this.readDhcpOctetFields("dhcpIpAddressField");
    const dhcpSubnetMask = this.readDhcpOctetFields("dhcpSubnetMaskField");
    const dhcpStartIp = this.readDhcpOctetFields("dhcpStartIpField");
    const dhcpEndIp = this.readDhcpOctetFields("dhcpEndIpField");

    const dhcpIspDnsEnabled = DomService.getInputElement(
      this.s.dhcpIspDnsEnabled
    ).checked;

    let dhcpPrimaryDns: (string | null)[] = [];
    let dhcpSecondaryDns: (string | null)[] = [];
    if (!dhcpIspDnsEnabled) {
      dhcpPrimaryDns = this.readDhcpOctetFields("dhcpPrimaryDnsField");
      dhcpSecondaryDns = this.readDhcpOctetFields("dhcpSecondaryDnsField");
    }

    const dhcpLeaseTimeModeValue = DomService.getOptionalValue(
      this.s.dhcpLeaseTimeMode
    );
    const dhcpLeaseTime =
      dhcpLeaseTimeModeValue !== "Infinity"
        ? (DomService.getOptionalValue(this.s.dhcpLeaseTime) ?? "")
        : "Infinity";
    const dhcpLeaseTimeMode = DomService.getSelectedOptionText(
      this.s.dhcpLeaseTimeMode
    );

    return {
      dhcpEnabled,
      dhcpIpAddress: dhcpIpAddress.join("."),
      dhcpSubnetMask: dhcpSubnetMask.join("."),
      dhcpStartIp: dhcpStartIp.join("."),
      dhcpEndIp: dhcpEndIp.join("."),
      dhcpIspDnsEnabled,
      dhcpPrimaryDns: dhcpPrimaryDns.join("."),
      dhcpSecondaryDns: dhcpSecondaryDns.join("."),
      dhcpLeaseTimeMode: dhcpLeaseTimeMode ?? "",
      dhcpLeaseTime: dhcpLeaseTime ?? "",
    };
  }

  private readDhcpOctetFields(
    prefix:
      | "dhcpIpAddressField"
      | "dhcpSubnetMaskField"
      | "dhcpStartIpField"
      | "dhcpEndIpField"
      | "dhcpPrimaryDnsField"
      | "dhcpSecondaryDnsField"
  ): (string | null)[] {
    const keys = [1, 2, 3, 4].map(
      (i) => `${prefix}${i}` as keyof typeof Selectors
    );
    return keys.map(
      (key) => DomService.getOptionalValue(this.s[key] as string) ?? null
    );
  }

  public isAuthenticated(): boolean {
    const internetTab = document.querySelector(this.s.internetTab);
    const onLoginPage = this.isLoginPage();
    return !onLoginPage && internetTab instanceof HTMLElement;
  }

  public buttonElementConfig(): ButtonConfig | null {
    return {
      targetSelector: "#loginContainer",
      text: "Get Data Automatically",
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
