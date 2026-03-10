import { DomService } from "../dom/DomService.js";
import { Router } from "../../domain/models/Router.js";
import {
  ExtractionResultSchema,
  type ButtonConfig,
  type Credentials,
  type ExtractionResult,
} from "../../domain/schemas/validation.js";

export class ZteH199ADriver extends Router {
  private readonly selectors = {
    // Login
    username: '#Frm_Username, input[name="Frm_Username"]',
    password: '#Frm_Password, input[name="Frm_Password"]',
    submit: '#LoginId, button[type="submit"]',

    // Main menu
    homeTab: "#homePage",
    topologyTab: "#mmTopology",
    internetTab: "#internet",
    localNetworkTab: "#localnet",
    managementTab: "#mgrAndDiag",

    // Internet -> Status
    linkSpeed: "#cLinkSpeed\\:0",

    // Internet -> WAN
    wanContainer: "#internetConfig",

    // Internet -> WAN -> PPPoE
    pppoeEntry: "#instName_Internet\\:0",
    serviceListInternet: "#Servlist_INTERNET\\:0",
    serviceListTr069: "#Servlist_TR069\\:0",
    pppoeUsername:
      '#UserName\\:0, [id="UserName:0"], [name="UserName:0"], input[name*="UserName"]',
    ipMode:
      '#IpMode\\:0, [id="IpMode:0"], [name="IpMode:0"], select[name*="IpMode"]',
    requestPd: "#IsPD1\\:0",
    slaac: "#IsSLAAC\\:0",
    dhcpv6: "#IsGUA\\:0",
    pdAddress: "#IsPdAddr\\:0",

    // Security
    securityContainer: "#security",

    // Security -> Remote access
    localServiceControl: "#localServiceCtrl",
    serviceControlBar: "#serviceCtlBar",
    ipv4RemoteAccessToggle: "#Enable1\\:serviceCtl\\:0",
    ipv6ServiceControlBar: "#IPv6serviceCtlBar",
    ipv6RemoteAccessToggle: "#Enable1\\:IPv6serviceCtl\\:0",

    // Topology -> All clients
    allClientsSection: "#clientFormBar",
    clientFormContainer: "#PopDevData_container, #clientFormContainer",
  } as const;

  constructor() {
    super("ZTE ZXHN H199A");
  }

  public authenticate(credentials: Credentials): void {
    const { username, password } = credentials;

    const usernameField = DomService.getValueElement(this.selectors.username);
    const passwordField = DomService.getValueElement(this.selectors.password);
    const submitButton = DomService.getElement(
      this.selectors.submit,
      HTMLElement
    );

    DomService.updateField(usernameField, username);
    DomService.updateField(passwordField, password);

    setTimeout(() => DomService.safeClick(submitButton), 100);
  }

  public async extract(): Promise<ExtractionResult> {
    const data = {
      timestamp: new Date().toISOString(),
      ...(await this.extractTopologyData()),
      ...(await this.extractWanData()),
      ...(await this.extractRemoteAccessData()),
    };

    return ExtractionResultSchema.parse(data);
  }

  private async clickMenuSectionAndWait(
    sectionSelector: string,
    waitForSelector?: string,
    delayMs?: number
  ): Promise<void> {
    const section = DomService.getElement(sectionSelector, HTMLElement);
    DomService.safeClick(section);
    await new Promise((resolve) => setTimeout(resolve, delayMs ?? 500));
    await this.waitForElement(waitForSelector ?? sectionSelector);
  }

  private async extractWanData(): Promise<ExtractionResult> {
    await this.clickMenuSectionAndWait(
      this.selectors.internetTab,
      this.selectors.wanContainer
    );

    const wanLinkSpeed = (
      DomService.getOptionalValue(this.selectors.linkSpeed) ?? ""
    ).trim();

    await this.clickMenuSectionAndWait(
      this.selectors.wanContainer,
      this.selectors.pppoeEntry
    );

    const pppoeEntryElement = DomService.getElement(
      this.selectors.pppoeEntry,
      HTMLElement
    );
    DomService.safeClick(pppoeEntryElement);

    const pppoeUsername = (
      DomService.getOptionalValue(this.selectors.pppoeUsername) ?? ""
    ).trim();
    const internetStatus = DomService.getInputElement(
      this.selectors.serviceListInternet
    ).checked;
    const tr069Status = DomService.getInputElement(
      this.selectors.serviceListTr069
    ).checked;
    const requestPdStatus = DomService.getInputElement(
      this.selectors.requestPd
    ).checked;
    const slaacStatus = DomService.getInputElement(
      this.selectors.slaac
    ).checked;
    const dhcpv6Status = DomService.getInputElement(
      this.selectors.dhcpv6
    ).checked;
    const pdStatus = DomService.getInputElement(
      this.selectors.pdAddress
    ).checked;
    const ipModeValue = DomService.getOptionalValue(this.selectors.ipMode);
    const ipVersion =
      ipModeValue?.toLowerCase() === "both"
        ? "IPv4/IPv6"
        : (ipModeValue ?? null);

    return {
      pppoeUsername,
      internetStatus,
      tr069Status,
      ipVersion,
      requestPdStatus,
      slaacStatus,
      dhcpv6Status,
      pdStatus,
      linkSpeed: wanLinkSpeed,
    };
  }

  private async extractRemoteAccessData(): Promise<ExtractionResult> {
    await this.clickMenuSectionAndWait(
      this.selectors.internetTab,
      this.selectors.securityContainer
    );

    await this.clickMenuSectionAndWait(
      this.selectors.securityContainer,
      this.selectors.localServiceControl
    );

    await this.clickMenuSectionAndWait(
      this.selectors.localServiceControl,
      this.selectors.serviceControlBar
    );

    const remoteAccessIpv4Status = DomService.getInputElement(
      this.selectors.ipv4RemoteAccessToggle
    ).checked;

    await this.clickMenuSectionAndWait(
      this.selectors.ipv6ServiceControlBar,
      this.selectors.ipv6RemoteAccessToggle
    );

    const remoteAccessIpv6Status = DomService.getInputElement(
      this.selectors.ipv6RemoteAccessToggle
    ).checked;

    return {
      remoteAccessIpv4Status,
      remoteAccessIpv6Status,
    };
  }

  private async extractTopologyData(): Promise<ExtractionResult> {
    await this.clickMenuSectionAndWait(
      this.selectors.topologyTab,
      this.selectors.allClientsSection
    );

    type TopologyBand = "24ghz" | "5ghz" | "cable";

    const clientsByBand: Record<
      TopologyBand,
      { name: string; ip: string; mac: string; signal: number }[]
    > = {
      "24ghz": [],
      "5ghz": [],
      cable: [],
    };

    // Get all router circles (controller and agents) from the topology SVG
    const routerCircles = Array.from(
      document.querySelectorAll<SVGCircleElement>("circle.router[id]")
    );

    for (const circle of routerCircles) {
      circle.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );

      await this.waitForElement("#PopDevDataDiv_copy");

      // Popup content is filled via AJAX; wait for data rows or timeout
      await Promise.race([
        this.waitForElement(
          "#PopDevDataDiv_copy div.devTblRow[id^='data_laninfo_'], #PopDevDataDiv_copy div.devTblRow[id^='data_wlan2Ginfo_'], #PopDevDataDiv_copy div.devTblRow[id^='data_wlan5Ginfo_']",
          3000
        ),
        new Promise((r) => setTimeout(r, 2500)),
      ]).catch(() => {});

      const popup = document.querySelector<HTMLElement>("#PopDevDataDiv_copy");
      if (!popup) continue;

      const lanSection = popup.querySelector<HTMLElement>("#lan_accessdev");
      if (lanSection) {
        const lanRows = Array.from(
          lanSection.querySelectorAll<HTMLElement>(
            'div.devTblRow[id^="data_laninfo_"]'
          )
        );

        for (const row of lanRows) {
          const name =
            row
              .querySelector<HTMLElement>('span[id^="HostName_"]')
              ?.textContent?.trim() ?? "";
          const mac =
            row
              .querySelector<HTMLElement>('span[id^="MacAddr_"]')
              ?.textContent?.trim() ?? "";
          const ip =
            row
              .querySelector<HTMLElement>('span[id^="IpAddr_"]')
              ?.textContent?.trim() ?? "";

          if (!mac) {
            continue;
          }

          clientsByBand.cable.push({
            name: name || mac,
            ip,
            mac,
            signal: 0,
          });
        }
      }

      const wlan2Section =
        popup.querySelector<HTMLElement>("#wlan2G_accessdev");
      if (wlan2Section) {
        const wlan2Rows = Array.from(
          wlan2Section.querySelectorAll<HTMLElement>(
            'div.devTblRow[id^="data_wlan2Ginfo_"]'
          )
        );

        for (const row of wlan2Rows) {
          const name =
            row
              .querySelector<HTMLElement>('span[id^="HostName_"]')
              ?.textContent?.trim() ?? "";
          const mac =
            row
              .querySelector<HTMLElement>('span[id^="MacAddr_"]')
              ?.textContent?.trim() ?? "";
          const ip =
            row
              .querySelector<HTMLElement>('span[id^="IpAddr_"]')
              ?.textContent?.trim() ?? "";
          const rssiText =
            row
              .querySelector<HTMLElement>('span[id^="Rssi_"]')
              ?.textContent?.trim() ?? "";

          if (!mac) {
            continue;
          }

          const rssiMatch = rssiText.match(/-?\d+/);
          let signal = 0;
          if (rssiMatch) {
            const parsed = Number(rssiMatch[0]);
            if (Number.isFinite(parsed)) {
              signal = parsed;
            }
          }

          clientsByBand["24ghz"].push({
            name: name || mac,
            ip,
            mac,
            signal,
          });
        }
      }

      const wlan5Section =
        popup.querySelector<HTMLElement>("#wlan5G_accessdev");
      if (wlan5Section) {
        const wlan5Rows = Array.from(
          wlan5Section.querySelectorAll<HTMLElement>(
            'div.devTblRow[id^="data_wlan5Ginfo_"]'
          )
        );

        for (const row of wlan5Rows) {
          const name =
            row
              .querySelector<HTMLElement>('span[id^="HostName_"]')
              ?.textContent?.trim() ?? "";
          const mac =
            row
              .querySelector<HTMLElement>('span[id^="MacAddr_"]')
              ?.textContent?.trim() ?? "";
          const ip =
            row
              .querySelector<HTMLElement>('span[id^="IpAddr_"]')
              ?.textContent?.trim() ?? "";
          const rssiText =
            row
              .querySelector<HTMLElement>('span[id^="Rssi_"]')
              ?.textContent?.trim() ?? "";

          if (!mac) {
            continue;
          }

          const rssiMatch = rssiText.match(/-?\d+/);
          let signal = 0;
          if (rssiMatch) {
            const parsed = Number(rssiMatch[0]);
            if (Number.isFinite(parsed)) {
              signal = parsed;
            }
          }

          clientsByBand["5ghz"].push({
            name: name || mac,
            ip,
            mac,
            signal,
          });
        }
      }
    }

    // Fallback to legacy "clientFormContainer" layout if no clients were found
    if (
      clientsByBand["24ghz"].length === 0 &&
      clientsByBand["5ghz"].length === 0 &&
      clientsByBand.cable.length === 0
    ) {
      await this.clickMenuSectionAndWait(
        this.selectors.topologyTab,
        this.selectors.allClientsSection
      );

      await this.clickMenuSectionAndWait(
        this.selectors.allClientsSection,
        this.selectors.clientFormContainer
      );

      const legacyContainer = document.querySelector<HTMLElement>(
        "#clientFormContainer, #clientFormBar"
      );

      if (legacyContainer) {
        const rows = Array.from(
          legacyContainer.querySelectorAll<HTMLElement>(
            '[id^="clientFormContent_"]'
          )
        );

        for (const row of rows) {
          const mac =
            row
              .querySelector<HTMLInputElement>('input[id^="MacAddr_"]')
              ?.value.trim() ?? "";

          if (!mac) {
            continue;
          }

          const name =
            row
              .querySelector<HTMLElement>('span[id^="clientHostName_"]')
              ?.textContent?.trim() ?? "";

          const bandText =
            row
              .querySelector<HTMLElement>('span[id^="relateHz_"]')
              ?.textContent?.trim() ?? "";

          const rssiText =
            row
              .querySelector<HTMLElement>('span[id^="RSSI_"]')
              ?.textContent?.trim() ?? "";

          const rssiMatch = rssiText.match(/-?\d+/);
          let signal = 0;
          if (rssiMatch) {
            const parsed = Number(rssiMatch[0]);
            if (Number.isFinite(parsed)) {
              signal = parsed;
            }
          }

          const bandLower = bandText.toLowerCase();
          let band: TopologyBand;
          if (bandLower.includes("2.4")) {
            band = "24ghz";
          } else if (bandLower.includes("5")) {
            band = "5ghz";
          } else {
            band = "cable";
          }

          clientsByBand[band].push({
            name: name || mac,
            ip: "",
            mac,
            signal,
          });
        }
      }
    }

    const topology: ExtractionResult["topology"] = {
      "24ghz": { clients: clientsByBand["24ghz"] },
      "5ghz": { clients: clientsByBand["5ghz"] },
      cable: { clients: clientsByBand.cable },
    };

    return { topology };
  }

  protected readonly loginSelectors = {
    username: '#Frm_Username, input[name="Frm_Username"]',
    password:
      '#Frm_Password, input[name="Frm_Password"], input[type="password"]',
  };

  public isAuthenticated(): boolean {
    const internetTab = document.querySelector(this.selectors.internetTab);
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
