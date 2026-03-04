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
    internetTab: "#internet",
    securityTab: "#security",

    // WAN / Internet
    wanContainer: "#internetConfig",
    linkSpeed: "#cLinkSpeed\\:0",
    pppoeEntry: "#instName_Internet\\:0",
    pppoeUsername:
      '#UserName\\:0, [id="UserName:0"], [name="UserName:0"], input[name*="UserName"]',
    ipMode:
      '#IpMode\\:0, [id="IpMode:0"], [name="IpMode:0"], select[name*="IpMode"]',
    serviceListInternet: "#Servlist_INTERNET\\:0",
    serviceListTr069: "#Servlist_TR069\\:0",
    requestPd: "#IsPD1\\:0",
    slaac: "#IsSLAAC\\:0",
    dhcpv6: "#IsGUA\\:0",
    pdAddress: "#IsPdAddr\\:0",

    // Security → Remote access
    localServiceControl: "#localServiceCtrl",
    serviceControlBar: "#serviceCtlBar",
    ipv4RemoteAccessToggle: "#Enable1\\:serviceCtl\\:0",
    ipv6ServiceControlBar: "#IPv6serviceCtlBar",
    ipv6RemoteAccessToggle: "#Enable1\\:IPv6serviceCtl\\:0",
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

    const ppoeUsername = (
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
      ppoeUsername,
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
      this.selectors.securityTab
    );

    await this.clickMenuSectionAndWait(
      this.selectors.securityTab,
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
