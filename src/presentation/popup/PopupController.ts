import {
  LAST_DATA_STORAGE_KEY,
  PENDING_AUTH_ERROR_STORAGE_KEY,
  ROUTER_MODEL_STORAGE_KEY,
  COPY_TEXT_TEMPLATE_STORAGE_KEY,
  LAST_EXTERNAL_IP_STORAGE_KEY,
  LAST_INTERNAL_PING_TEST_STORAGE_KEY,
  LAST_EXTERNAL_PING_TEST_STORAGE_KEY,
} from "../../application/constants/index.js";
import { PopupStatusType } from "../../application/types/index.js";
import {
  CollectMessageAction,
  ExtractionResultSchema,
  type CollectMessage,
  type ExtractionResult,
  type PingTestResult,
} from "../../domain/schemas/validation.js";
import { DomService } from "../../infra/dom/DomService.js";

import { PopupView } from "./PopupView.js";

import { defaultBookmarksService } from "../../application/BookmarksService.js";
import {
  defaultPopupUiStateService,
  type PopupUiState,
} from "../../application/PopupUiStateService.js";

import type {
  CollectResponse,
  BookmarkStore,
  CredentialBookmark,
} from "../../application/types/index.js";
import { translator } from "../../infra/i18n/I18nService.js";
import { defaultTabMessenger } from "../../infra/tabs/ChromeTabMessenger.js";
import { ContentPageMessageAction } from "./index.js";
import { StorageService } from "../../infra/storage/StorageService.js";
import { SessionStorageService } from "../../infra/storage/SessionStorageService.js";
import { DiagnosticsMode } from "../../domain/schemas/validation.js";

/** Presentation controller: drives popup UI and Chrome messaging. */
export class PopupController {
  private currentData: ExtractionResult | null = null;
  private currentInternalPingResult: PingTestResult | null = null;
  private currentExternalPingResult: PingTestResult | null = null;
  private activeTabId: number | null = null;
  private routerModel: string | null = null;
  private copyButtonResetTimeout: number | null = null;
  private currentDiagnosticsMode: DiagnosticsMode = DiagnosticsMode.INTERNAL;
  private diagnosticsSelectElement: HTMLSelectElement | null = null;
  private diagnosticsInputElement: HTMLInputElement | null = null;
  private persistedStatus: { type: PopupStatusType; text: string } = {
    type: PopupStatusType.NONE,
    text: translator.t("popup_status_ready"),
  };
  private persistedLogs: Array<{
    msg: string;
    type: PopupStatusType;
    time: string;
  }> = [];

  private readonly bookmarksService = defaultBookmarksService;
  private readonly uiStateService = defaultPopupUiStateService;

  private static readonly EXPECTED_NAVIGATION_ERROR_SNIPPETS = [
    "message channel closed before a response was received",
    "receiving end does not exist",
    "the tab was closed",
  ];

  private wlan24GhzSsidIndex = 0;
  private wlan5GhzSsidIndex = 0;

  constructor() {
    this.setupListeners();
    this.resetDiagnosticsControls();
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.resolveActiveTab();
    const isModelDetected = await this.updateRouterModel();
    this.setCollectButtonEnabled(isModelDetected);
    this.setCopyTextButtonEnabled(false);
    this.setPingButtonEnabled(false);
    this.setCopyResultButtonEnabled(false);
    await this.loadBookmarks();
    await this.loadPersistedData();
    await this.loadPersistedUiState();
    await this.checkPendingErrors();
  }

  private async resolveActiveTab(): Promise<void> {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    this.activeTabId = tab?.id ?? null;
  }

  private setupListeners(): void {
    DomService.getElement("#popup-btn-collect", HTMLElement).addEventListener(
      "click",
      () => this.handleCollect()
    );
    DomService.getElement("#popup-btn-clear", HTMLElement).addEventListener(
      "click",
      () => this.handleClear()
    );
    DomService.getElement("#popup-btn-copy-text", HTMLElement).addEventListener(
      "click",
      () => void this.handleCopyText()
    );
    DomService.getElement(
      "#popup-btn-save-credentials",
      HTMLElement
    ).addEventListener("click", () => void this.handleSaveCredentials());
    DomService.getElement(
      "#popup-btn-toggle-bookmarks",
      HTMLElement
    ).addEventListener("click", () => void this.handleBookmarkButton());
    DomService.getElement(
      "#popup-diagnostics-btn-ping",
      HTMLElement
    ).addEventListener("click", () => this.handleDiagnosticsPing());
    DomService.getElement(
      "#popup-diagnostics-btn-copy-result",
      HTMLElement
    ).addEventListener("click", () => this.handleDiagnosticsCopyResult());

    const internalModeButton = document.getElementById(
      "popup-diagnostics-mode-internal"
    ) as HTMLButtonElement | null;
    const externalModeButton = document.getElementById(
      "popup-diagnostics-mode-external"
    ) as HTMLButtonElement | null;

    internalModeButton?.addEventListener("click", () => {
      this.setDiagnosticsMode(DiagnosticsMode.INTERNAL);
    });

    externalModeButton?.addEventListener("click", () => {
      this.setDiagnosticsMode(DiagnosticsMode.EXTERNAL);
    });

    const wlan24Prev = document.getElementById(
      "popup-wlan24ghz-ssid-prev"
    ) as HTMLButtonElement | null;
    const wlan24Next = document.getElementById(
      "popup-wlan24ghz-ssid-next"
    ) as HTMLButtonElement | null;
    const wlan5Prev = document.getElementById(
      "popup-wlan5ghz-ssid-prev"
    ) as HTMLButtonElement | null;
    const wlan5Next = document.getElementById(
      "popup-wlan5ghz-ssid-next"
    ) as HTMLButtonElement | null;

    wlan24Prev?.addEventListener("click", () =>
      this.changeSsidIndex("24ghz", -1)
    );
    wlan24Next?.addEventListener("click", () =>
      this.changeSsidIndex("24ghz", 1)
    );
    wlan5Prev?.addEventListener("click", () =>
      this.changeSsidIndex("5ghz", -1)
    );
    wlan5Next?.addEventListener("click", () => this.changeSsidIndex("5ghz", 1));
  }

  /**
   * Copies text to clipboard. Uses textarea+execCommand so it works in the
   * extension popup, where the Clipboard API is blocked by permissions policy.
   */
  private copyTextToClipboard(text: string): void {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
  }

  private async handleCopyText(): Promise<void> {
    if (this.currentData === null) {
      return;
    }

    const template =
      (await StorageService.get<string>(COPY_TEXT_TEMPLATE_STORAGE_KEY)) ?? "";

    if (!template || template.trim() === "") {
      return;
    }

    const message = this.buildCopyTextFromTemplate(template, this.currentData);
    this.copyTextToClipboard(message);

    this.showCopyButtonFeedback(
      DomService.getElement("#popup-btn-copy-text", HTMLButtonElement),
      "popup_copy_text"
    );
  }

  private showCopyButtonFeedback(
    element: HTMLButtonElement | null,
    labelKey: string
  ): void {
    if (!element) return;

    const labelSpan = element.querySelector(
      `[data-i18n='${labelKey}']`
    ) as HTMLElement | null;

    if (!labelSpan) return;

    const copiedText = translator.t("popup_copy_text_copied");
    const copiedAria = translator.t("popup_copy_text_copied_aria");

    labelSpan.textContent = copiedText;
    element.setAttribute("aria-label", copiedAria);

    if (this.copyButtonResetTimeout !== null) {
      window.clearTimeout(this.copyButtonResetTimeout);
    }

    this.copyButtonResetTimeout = window.setTimeout(() => {
      labelSpan.textContent = translator.t(labelKey);
      element.setAttribute("aria-label", translator.t(`${labelKey}_aria`));
      this.copyButtonResetTimeout = null;
    }, 3000);
  }

  private buildCopyTextFromTemplate(
    template: string,
    data: ExtractionResult
  ): string {
    const asText = (value: unknown): string =>
      value === undefined || value === null || value === ""
        ? "-"
        : String(value);

    const boolText = (value: boolean | undefined): string =>
      this.toStatusText(value) ?? "-";

    const wlan24 = data.wlan24GhzConfig;
    const wlan5 = data.wlan5GhzConfig;

    const values: Record<string, string> = {
      // General
      RouterVersion: asText(data.routerVersion),
      TR069Url: asText(data.tr069Url),

      // WAN / Internet
      InternetStatus: boolText(data.internetEnabled),
      TR069Status: boolText(data.tr069Enabled),
      PPPoEUsername: asText(data.pppoeUsername),
      IpVersion: asText(data.ipVersion),
      LinkMode: asText(data.linkSpeed),
      RequestPdStatus: boolText(data.requestPdEnabled),
      SlaacStatus: boolText(data.slaacEnabled),
      Dhcpv6Status: boolText(data.dhcpv6Enabled),
      PdStatus: boolText(data.pdEnabled),

      // Remote access
      RemoteAccessIpv4Status: boolText(data.remoteAccessIpv4Enabled),
      RemoteAccessIpv6Status: boolText(data.remoteAccessIpv6Enabled),

      // Band steering
      BandSteeringStatus: boolText(data.bandSteeringEnabled),

      // WLAN 2.4GHz
      Wlan24Status: wlan24 ? boolText(wlan24.enabled) : "-",
      Wlan24Channel: wlan24 ? asText(wlan24.channel) : "-",
      Wlan24Mode: wlan24 ? asText(wlan24.mode) : "-",
      Wlan24BandWidth: wlan24 ? asText(wlan24.bandWidth) : "-",
      Wlan24TransmittingPower: wlan24 ? asText(wlan24.transmittingPower) : "-",
      Wlan24SsidName: wlan24 ? asText(wlan24.ssidName) : "-",
      Wlan24SsidPassword: wlan24 ? asText(wlan24.ssidPassword) : "-",
      Wlan24SsidHideMode: wlan24 ? asText(wlan24.ssidHideMode) : "-",
      Wlan24Wpa2SecurityType: wlan24 ? asText(wlan24.wpa2SecurityType) : "-",
      Wlan24MaxClients: wlan24 ? asText(wlan24.maxClients) : "-",

      // WLAN 5GHz
      Wlan5Status: wlan5 ? boolText(wlan5.enabled) : "-",
      Wlan5Channel: wlan5 ? asText(wlan5.channel) : "-",
      Wlan5Mode: wlan5 ? asText(wlan5.mode) : "-",
      Wlan5BandWidth: wlan5 ? asText(wlan5.bandWidth) : "-",
      Wlan5TransmittingPower: wlan5 ? asText(wlan5.transmittingPower) : "-",
      Wlan5SsidName: wlan5 ? asText(wlan5.ssidName) : "-",
      Wlan5SsidPassword: wlan5 ? asText(wlan5.ssidPassword) : "-",
      Wlan5SsidHideMode: wlan5 ? asText(wlan5.ssidHideMode) : "-",
      Wlan5Wpa2SecurityType: wlan5 ? asText(wlan5.wpa2SecurityType) : "-",
      Wlan5MaxClients: wlan5 ? asText(wlan5.maxClients) : "-",

      // DHCP
      DhcpStatus: boolText(data.dhcpEnabled),
      DhcpIpAddress: asText(data.dhcpIpAddress),
      DhcpSubnetMask: asText(data.dhcpSubnetMask),
      DhcpStartIp: asText(data.dhcpStartIp),
      DhcpEndIp: asText(data.dhcpEndIp),
      DhcpIspDnsStatus: boolText(data.dhcpIspDnsEnabled),
      DhcpPrimaryDns: asText(data.dhcpPrimaryDns),
      DhcpSecondaryDns: asText(data.dhcpSecondaryDns),
      DhcpLeaseTimeMode: asText(data.dhcpLeaseTimeMode),
      DhcpLeaseTime: asText(data.dhcpLeaseTime),

      // UPnP
      UpnpStatus: boolText(data.upnpEnabled),

      // Last internal ping
      LastInternalPingMessage: asText(this.currentInternalPingResult?.message),
      LastInternalPingIp: asText(this.currentInternalPingResult?.ip),
      LastInternalPingBytes: asText(this.currentInternalPingResult?.bytes),
      LastInternalPingTtl: asText(this.currentInternalPingResult?.ttl),
      LastInternalPingMinAvgMax: asText(
        "min/avg/max: " +
          [
            this.currentInternalPingResult?.packets.min,
            this.currentInternalPingResult?.packets.avg,
            this.currentInternalPingResult?.packets.max,
          ].join("/")
      ),
      LastInternalPingMin: asText(this.currentInternalPingResult?.packets.min),
      LastInternalPingAvg: asText(this.currentInternalPingResult?.packets.avg),
      LastInternalPingMax: asText(this.currentInternalPingResult?.packets.max),

      // Last external ping
      LastExternalPingMessage: asText(this.currentExternalPingResult?.message),
      LastExternalPingIp: asText(this.currentExternalPingResult?.ip),
      LastExternalPingBytes: asText(this.currentExternalPingResult?.bytes),
      LastExternalPingTtl: asText(this.currentExternalPingResult?.ttl),
      LastExternalPingMinAvgMax: asText(
        "min/avg/max: " +
          [
            this.currentExternalPingResult?.packets.min,
            this.currentExternalPingResult?.packets.avg,
            this.currentExternalPingResult?.packets.max,
          ].join("/")
      ),
      LastExternalPingMin: asText(this.currentExternalPingResult?.packets.min),
      LastExternalPingAvg: asText(this.currentExternalPingResult?.packets.avg),
      LastExternalPingMax: asText(this.currentExternalPingResult?.packets.max),
    };

    return template.replace(
      /%([A-Za-z0-9_]+)%/g,
      (_match, key: string): string => {
        const value = values[key];
        return value ?? `%${key}%`;
      }
    );
  }

  private async handleCollect(): Promise<void> {
    const user =
      DomService.getValueElement("#popup-input-username").value.trim() ||
      "admin";
    const pass = DomService.getValueElement("#popup-input-password").value;

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) {
      this.setStatus(
        PopupStatusType.ERR,
        translator.t("popup_error_no_active_tab")
      );
      this.log(translator.t("popup_log_no_active_tab"), PopupStatusType.ERR);
      return;
    }

    try {
      const response = await defaultTabMessenger.sendToTab<
        CollectMessage,
        CollectResponse
      >(tab.id, {
        action: CollectMessageAction.AUTHENTICATE,
        credentials: { username: user, password: pass },
      });

      if (!response?.success) {
        const errorMessage = this.getResponseMessage(response);
        this.setStatus(PopupStatusType.WARN, errorMessage);
        this.log(errorMessage, PopupStatusType.WARN);
        return;
      }

      if (response.success) {
        await this.startRetryLoop(tab.id);
        return;
      }

      this.processResponse(response);
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      const isExpectedNavigationError =
        this.isExpectedNavigationError(errorMessage);

      if (isExpectedNavigationError) {
        this.log(translator.t("popup_log_redirect_retry"), PopupStatusType.ERR);
        await this.startRetryLoop(tab.id);
        return;
      }

      this.setStatus(
        PopupStatusType.ERR,
        translator.t("popup_error_router_comm")
      );
      this.log(errorMessage, PopupStatusType.ERR);
    }
  }

  private async startRetryLoop(tabId: number): Promise<void> {
    const maxRetries = 5;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.log(
        translator.t(
          "popup_log_retry_attempt",
          String(attempt),
          String(maxRetries)
        )
      );

      try {
        const res = await defaultTabMessenger.sendToTab<
          CollectMessage,
          CollectResponse
        >(tabId, {
          action: CollectMessageAction.COLLECT,
        });

        if (res?.success) {
          this.processResponse(res);
          return;
        }
      } catch (error) {
        const message = this.getErrorMessage(error);
        if (!this.isExpectedNavigationError(message)) {
          this.log(message, PopupStatusType.WARN);
        }
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    this.setStatus(
      PopupStatusType.ERR,
      translator.t("popup_error_timeout_waiting")
    );
    this.log(translator.t("popup_log_timeout_waiting"), PopupStatusType.ERR);
  }

  private processResponse(response: CollectResponse): void {
    const result = ExtractionResultSchema.safeParse({
      ...response.data,
      timestamp: new Date().toISOString(),
    });

    if (!result.success) {
      this.setStatus(
        PopupStatusType.WARN,
        translator.t("popup_error_unexpected_format")
      );
      return;
    }

    this.currentData = result.data;
    this.renderData();
    void this.persistCurrentData();
    this.setStatus(
      PopupStatusType.OK,
      translator.t("popup_status_collected_ok")
    );
  }

  private renderData(): void {
    if (this.currentData === null) return;

    const data = this.currentData;
    PopupView.updateField("pppoeUsername", data?.pppoeUsername ?? null);
    PopupView.updateField(
      "internetStatus",
      this.toStatusText(data?.internetEnabled)
    );
    PopupView.updateField("tr069Status", this.toStatusText(data?.tr069Enabled));
    PopupView.updateField("ipVersion", data?.ipVersion ?? null);
    PopupView.updateField(
      "requestPdStatus",
      this.toStatusText(data?.requestPdEnabled)
    );
    PopupView.updateField("slaacStatus", this.toStatusText(data?.slaacEnabled));
    PopupView.updateField(
      "dhcpv6Status",
      this.toStatusText(data?.dhcpv6Enabled)
    );
    PopupView.updateField("pdStatus", this.toStatusText(data?.pdEnabled));
    PopupView.updateField("linkSpeed", data?.linkSpeed ?? null);
    PopupView.updateField(
      "remoteAccessIpv4Status",
      this.toStatusText(data?.remoteAccessIpv4Enabled)
    );
    PopupView.updateField(
      "remoteAccessIpv6Status",
      this.toStatusText(data?.remoteAccessIpv6Enabled)
    );
    PopupView.updateField(
      "wlanBandSteeringStatus",
      this.toStatusText(data?.bandSteeringEnabled)
    );
    this.renderWlanSections(data);
    PopupView.updateField("dhcpEnabled", this.toStatusText(data?.dhcpEnabled));
    PopupView.updateField("dhcpIpAddress", data?.dhcpIpAddress ?? null);
    PopupView.updateField("dhcpSubnetMask", data?.dhcpSubnetMask ?? null);
    PopupView.updateField("dhcpStartIp", data?.dhcpStartIp ?? null);
    PopupView.updateField("dhcpEndIp", data?.dhcpEndIp ?? null);
    PopupView.updateField(
      "dhcpIspDnsEnabled",
      this.toStatusText(data?.dhcpIspDnsEnabled)
    );
    PopupView.updateField("dhcpPrimaryDns", data?.dhcpPrimaryDns ?? null);
    PopupView.updateField("dhcpSecondaryDns", data?.dhcpSecondaryDns ?? null);
    PopupView.updateField("dhcpLeaseTimeMode", data?.dhcpLeaseTimeMode ?? null);
    PopupView.updateField("dhcpLeaseTime", data?.dhcpLeaseTime ?? null);
    PopupView.updateField("upnpEnabled", this.toStatusText(data?.upnpEnabled));
    PopupView.updateField("routerVersion", data?.routerVersion ?? null);
    PopupView.updateField("tr069Url", data?.tr069Url ?? null);
    const topology = data?.topology;
    if (topology) {
      for (const band of ["24ghz", "5ghz", "cable"] as const) {
        this.renderTopologyBand(band, topology[band].clients);
      }
    }
    if (
      (topology?.["24ghz"]?.clients.length ?? 0) > 0 ||
      (topology?.["5ghz"]?.clients.length ?? 0) > 0 ||
      (topology?.["cable"]?.clients.length ?? 0) > 0
    ) {
      this.setPingButtonEnabled(true);
    }
    this.populateDiagnosticsDevicesFromTopology();
    this.setCopyTextButtonEnabled(true);
  }

  private renderWlanSections(data: ExtractionResult): void {
    const base24 = data.wlan24GhzConfig;
    const base5 = data.wlan5GhzConfig;

    PopupView.updateField(
      "wlan24ghzStatus",
      this.toStatusText(base24?.enabled) ?? null
    );
    PopupView.updateField("wlan24ghzChannel", String(base24?.channel ?? null));
    PopupView.updateField("wlan24ghzBandWidth", base24?.bandWidth ?? null);
    PopupView.updateField(
      "wlan24ghzTransmittingPower",
      base24?.transmittingPower ?? null
    );
    PopupView.updateField("wlan24ghzMode", base24?.mode ?? null);

    const ssids24 = data.wlan24GhzSsids ?? [];
    if (ssids24.length > 0) {
      this.wlan24GhzSsidIndex =
        ((this.wlan24GhzSsidIndex % ssids24.length) + ssids24.length) %
        ssids24.length;
      const active = ssids24[this.wlan24GhzSsidIndex]!;
      PopupView.updateField("wlan24ghzSsidName", active.ssidName || null);
      PopupView.updateField(
        "wlan24ghzSsidPassword",
        active.ssidPassword || null
      );
      PopupView.updateField(
        "wlan24ghzSsidHideMode",
        active.ssidHideMode || null
      );
      PopupView.updateField(
        "wlan24ghzWpa2Security",
        active.wpa2SecurityType || null
      );
      PopupView.updateField("wlan24ghzMaxClients", String(active.maxClients));
      PopupView.updateField(
        "wlan24ghzSsidIndex",
        `${this.wlan24GhzSsidIndex + 1} / ${ssids24.length}`
      );
    } else {
      PopupView.updateField("wlan24ghzSsidName", base24?.ssidName ?? null);
      PopupView.updateField(
        "wlan24ghzSsidPassword",
        base24?.ssidPassword ?? null
      );
      PopupView.updateField(
        "wlan24ghzSsidHideMode",
        base24?.ssidHideMode ?? null
      );
      PopupView.updateField(
        "wlan24ghzWpa2Security",
        base24?.wpa2SecurityType ?? null
      );
      PopupView.updateField(
        "wlan24ghzMaxClients",
        base24?.maxClients != null ? String(base24.maxClients) : null
      );
      PopupView.updateField("wlan24ghzSsidIndex", null);
    }

    PopupView.updateField(
      "wlan5ghzStatus",
      this.toStatusText(base5?.enabled) ?? null
    );
    PopupView.updateField("wlan5ghzChannel", String(base5?.channel ?? null));
    PopupView.updateField("wlan5ghzBandWidth", base5?.bandWidth ?? null);
    PopupView.updateField(
      "wlan5ghzTransmittingPower",
      base5?.transmittingPower ?? null
    );
    PopupView.updateField("wlan5ghzMode", base5?.mode ?? null);

    const ssids5 = data.wlan5GhzSsids ?? [];
    if (ssids5.length > 0) {
      this.wlan5GhzSsidIndex =
        ((this.wlan5GhzSsidIndex % ssids5.length) + ssids5.length) %
        ssids5.length;
      const active = ssids5[this.wlan5GhzSsidIndex]!;
      PopupView.updateField("wlan5ghzSsidName", active.ssidName || null);
      PopupView.updateField(
        "wlan5ghzSsidPassword",
        active.ssidPassword || null
      );
      PopupView.updateField(
        "wlan5ghzSsidHideMode",
        active.ssidHideMode || null
      );
      PopupView.updateField(
        "wlan5ghzWpa2Security",
        active.wpa2SecurityType || null
      );
      PopupView.updateField("wlan5ghzMaxClients", String(active.maxClients));
      PopupView.updateField(
        "wlan5ghzSsidIndex",
        `${this.wlan5GhzSsidIndex + 1} / ${ssids5.length}`
      );
    } else {
      PopupView.updateField("wlan5ghzSsidName", base5?.ssidName ?? null);
      PopupView.updateField(
        "wlan5ghzSsidPassword",
        base5?.ssidPassword ?? null
      );
      PopupView.updateField(
        "wlan5ghzSsidHideMode",
        base5?.ssidHideMode ?? null
      );
      PopupView.updateField(
        "wlan5ghzWpa2Security",
        base5?.wpa2SecurityType ?? null
      );
      PopupView.updateField(
        "wlan5ghzMaxClients",
        base5?.maxClients != null ? String(base5.maxClients) : null
      );
      PopupView.updateField("wlan5ghzSsidIndex", null);
    }
  }

  private renderTopologyBand(
    band: "24ghz" | "5ghz" | "cable",
    clients: Array<{ name: string; ip: string; mac: string; signal: number }>
  ): void {
    if (clients.length === 0) return;

    const panel = DomService.getElement(
      `#popup-section-topology-${band}-body`,
      HTMLDivElement
    );
    panel.innerHTML = "";

    for (const client of clients) {
      const entry = document.createElement("div");
      entry.className = "popup-topology-client-entry";

      const nameSpan = document.createElement("span");
      nameSpan.className = "popup-topology-client-name";
      nameSpan.textContent = client.name;

      const ipSpan = document.createElement("span");
      ipSpan.className = "popup-topology-client-ip";
      ipSpan.textContent = client.ip;

      const macSpan = document.createElement("span");
      macSpan.className = "popup-topology-client-mac";
      macSpan.textContent = client.mac.toUpperCase();

      const signalSpan = document.createElement("span");
      signalSpan.className = "popup-topology-client-signal";
      signalSpan.textContent = String(client.signal);

      entry.append(nameSpan, ipSpan, macSpan, signalSpan);
      panel.prepend(entry);
    }
  }

  private clearTopologyBand(band: "24ghz" | "5ghz" | "cable"): void {
    const panel = DomService.getElement(
      `#popup-section-topology-${band}-body`,
      HTMLDivElement
    );
    panel.innerHTML = "";
    const span = document.createElement("span");
    span.className = "popup-topology-no-data";
    span.textContent = translator.t("popup_topology_no_data");
    panel.appendChild(span);
  }

  private resetDiagnosticsControls(): void {
    const select = document.getElementById(
      "popup-diagnostics-device-select"
    ) as HTMLSelectElement | HTMLInputElement | null;
    const pingButton = document.getElementById(
      "popup-diagnostics-btn-ping"
    ) as HTMLButtonElement | null;
    const output = document.getElementById(
      "popup-diagnostics-output"
    ) as HTMLTextAreaElement | null;

    if (select instanceof HTMLSelectElement) {
      select.innerHTML = "";
      select.disabled = true;
    } else if (select instanceof HTMLInputElement) {
      select.value = "";
      select.disabled = false;
    }
    if (pingButton) {
      pingButton.disabled = true;
    }
    if (output) {
      output.value = "";
    }
  }

  private async loadLastExternalIpIntoInput(): Promise<void> {
    if (!this.diagnosticsInputElement) {
      return;
    }

    try {
      const lastIp = await StorageService.get<string>(
        LAST_EXTERNAL_IP_STORAGE_KEY
      );
      if (typeof lastIp === "string" && lastIp.trim() !== "") {
        this.diagnosticsInputElement.value = lastIp;
        this.setPingButtonEnabled(true);
      }
    } catch {
      // Ignore storage errors for diagnostics convenience
    }
  }

  private setDiagnosticsMode(mode: DiagnosticsMode): void {
    const internalButton = document.getElementById(
      "popup-diagnostics-mode-internal"
    ) as HTMLButtonElement | null;
    const externalButton = document.getElementById(
      "popup-diagnostics-mode-external"
    ) as HTMLButtonElement | null;

    if (internalButton && externalButton) {
      if (mode === DiagnosticsMode.INTERNAL) {
        internalButton.classList.add("popup-diagnostics-mode-option--active");
        externalButton.classList.remove(
          "popup-diagnostics-mode-option--active"
        );
      } else {
        externalButton.classList.add("popup-diagnostics-mode-option--active");
        internalButton.classList.remove(
          "popup-diagnostics-mode-option--active"
        );
      }
    }

    this.currentDiagnosticsMode = mode;

    const container = document.getElementById(
      "popup-diagnostics-device-container"
    ) as HTMLDivElement | null;
    if (!container) return;

    if (mode === DiagnosticsMode.INTERNAL) {
      if (!this.diagnosticsSelectElement) {
        const select = document.createElement("select");
        select.id = "popup-diagnostics-device-select";
        select.className = "popup-input";
        select.disabled = true;
        this.diagnosticsSelectElement = select;
      }

      container.innerHTML = "";
      container.appendChild(this.diagnosticsSelectElement);
      this.populateDiagnosticsDevicesFromTopology();
    } else {
      if (!this.diagnosticsInputElement) {
        const input = document.createElement("input");
        input.type = "text";
        input.id = "popup-diagnostics-device-select";
        input.className = "popup-input";
        this.diagnosticsInputElement = input;
      }

      container.innerHTML = "";
      container.appendChild(this.diagnosticsInputElement);
      this.loadLastExternalIpIntoInput();
      this.setPingButtonEnabled(true);
    }
  }

  private populateDiagnosticsDevicesFromTopology(): void {
    const select = document.getElementById(
      "popup-diagnostics-device-select"
    ) as HTMLSelectElement | HTMLInputElement | null;
    const pingButton = document.getElementById(
      "popup-diagnostics-btn-ping"
    ) as HTMLButtonElement | null;

    if (!select || !pingButton) return;

    // Only populate when the element is a select (internal mode)
    if (!(select instanceof HTMLSelectElement)) {
      return;
    }

    select.innerHTML = "";

    const topology = this.currentData?.topology;
    if (!topology) {
      select.disabled = true;
      pingButton.disabled = true;
      return;
    }

    const allClients = [
      ...topology["24ghz"].clients,
      ...topology["5ghz"].clients,
      ...topology["cable"].clients,
    ];

    if (allClients.length === 0) {
      select.disabled = true;
      pingButton.disabled = true;
      return;
    }

    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    placeholderOption.textContent = translator.t(
      "popup_diagnostics_device_placeholder"
    );
    select.appendChild(placeholderOption);

    for (const client of allClients) {
      const option = document.createElement("option");
      option.value = client.ip;
      option.textContent = `${client.ip} — ${client.name} — ${client.mac.toUpperCase()}`;
      select.appendChild(option);
    }

    select.disabled = false;
    pingButton.disabled = false;
  }
  private changeSsidIndex(band: "24ghz" | "5ghz", delta: number): void {
    if (!this.currentData) return;

    if (band === "24ghz") {
      const total = this.currentData.wlan24GhzSsids?.length ?? 0;
      if (total <= 1) return;
      this.wlan24GhzSsidIndex =
        (this.wlan24GhzSsidIndex + delta + total) % total;
    } else {
      const total = this.currentData.wlan5GhzSsids?.length ?? 0;
      if (total <= 1) return;
      this.wlan5GhzSsidIndex = (this.wlan5GhzSsidIndex + delta + total) % total;
    }

    this.renderWlanSections(this.currentData);
  }

  private async handleDiagnosticsPing(): Promise<void> {
    const select = document.getElementById(
      "popup-diagnostics-device-select"
    ) as HTMLSelectElement | HTMLInputElement | null;
    const output = document.getElementById(
      "popup-diagnostics-output"
    ) as HTMLTextAreaElement | null;

    if (!select || !output) return;

    const ip = select.value;
    if (!ip) {
      output.value = translator.t("popup_diagnostics_no_device_selected");
      return;
    }

    // Persist last external IP when in external diagnostics mode (input field)
    if (select instanceof HTMLInputElement) {
      void StorageService.save(LAST_EXTERNAL_IP_STORAGE_KEY, ip);
    }

    output.value = translator.t("popup_diagnostics_ping_started", ip);

    this.setPingButtonEnabled(false);

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab?.id) {
        const msg = translator.t("popup_error_no_active_tab");
        this.setStatus(PopupStatusType.ERR, msg);
        this.log(msg, PopupStatusType.ERR);
        return;
      }

      const response = await defaultTabMessenger.sendToTab<
        CollectMessage,
        CollectResponse
      >(tab.id, {
        action: CollectMessageAction.PING,
        ip,
      });

      if (!response?.success || !response?.pingResult) {
        const message = this.getResponseMessage(response);
        this.setStatus(PopupStatusType.WARN, message);
        this.log(message, PopupStatusType.WARN);
        output.value = message;
        return;
      }

      if (this.currentDiagnosticsMode === DiagnosticsMode.INTERNAL) {
        void SessionStorageService.save(
          LAST_INTERNAL_PING_TEST_STORAGE_KEY,
          response.pingResult
        );
        this.currentInternalPingResult = response.pingResult;
      } else {
        void SessionStorageService.save(
          LAST_EXTERNAL_PING_TEST_STORAGE_KEY,
          response.pingResult
        );
        this.currentExternalPingResult = response.pingResult;
      }

      output.value = response.pingResult.message;

      this.setStatus(
        PopupStatusType.OK,
        translator.t("popup_diagnostics_ping_success")
      );
      this.log(
        translator.t("popup_diagnostics_ping_success"),
        PopupStatusType.OK
      );

      this.setCopyResultButtonEnabled(true);
    } catch (error) {
      const message = this.getErrorMessage(error);
      this.setStatus(
        PopupStatusType.ERR,
        translator.t("popup_error_router_comm")
      );
      this.log(message, PopupStatusType.ERR);
      output.value = message;
    } finally {
      this.setPingButtonEnabled(true);
    }
  }

  private handleDiagnosticsCopyResult(): void {
    const output = document.getElementById(
      "popup-diagnostics-output"
    ) as HTMLTextAreaElement | null;
    if (!output) return;
    this.copyTextToClipboard(output.value);

    this.showCopyButtonFeedback(
      DomService.getElement(
        "#popup-diagnostics-btn-copy-result",
        HTMLButtonElement
      ),
      "popup_diagnostics_copy_result_button"
    );
  }

  private async checkPendingErrors(): Promise<void> {
    const pendingAuthError = await SessionStorageService.get<string>(
      PENDING_AUTH_ERROR_STORAGE_KEY
    );
    if (pendingAuthError !== null && pendingAuthError !== "") {
      await SessionStorageService.remove(PENDING_AUTH_ERROR_STORAGE_KEY);
      this.setStatus(PopupStatusType.WARN, pendingAuthError);
    }
  }

  private handleClear(): void {
    this.currentData = null;
    this.setStatus(PopupStatusType.NONE, translator.t("popup_status_ready"));
    PopupView.updateField("pppoeUsername", null);
    PopupView.updateField("internetStatus", null);
    PopupView.updateField("tr069Status", null);
    PopupView.updateField("ipVersion", null);
    PopupView.updateField("requestPdStatus", null);
    PopupView.updateField("slaacStatus", null);
    PopupView.updateField("dhcpv6Status", null);
    PopupView.updateField("pdStatus", null);
    PopupView.updateField("linkSpeed", null);
    PopupView.updateField("remoteAccessIpv4Status", null);
    PopupView.updateField("remoteAccessIpv6Status", null);
    PopupView.updateField("wlanBandSteeringStatus", null);
    PopupView.updateField("wlan24ghzStatus", null);
    PopupView.updateField("wlan24ghzChannel", null);
    PopupView.updateField("wlan24ghzBandWidth", null);
    PopupView.updateField("wlan24ghzTransmittingPower", null);
    PopupView.updateField("wlan24ghzMode", null);
    PopupView.updateField("wlan24ghzSsidName", null);
    PopupView.updateField("wlan24ghzSsidPassword", null);
    PopupView.updateField("wlan24ghzSsidHideMode", null);
    PopupView.updateField("wlan24ghzWpa2Security", null);
    PopupView.updateField("wlan24ghzMaxClients", null);
    PopupView.updateField("wlan5ghzStatus", null);
    PopupView.updateField("wlan5ghzChannel", null);
    PopupView.updateField("wlan5ghzBandWidth", null);
    PopupView.updateField("wlan5ghzTransmittingPower", null);
    PopupView.updateField("wlan5ghzMode", null);
    PopupView.updateField("wlan5ghzSsidName", null);
    PopupView.updateField("wlan5ghzSsidPassword", null);
    PopupView.updateField("wlan5ghzSsidHideMode", null);
    PopupView.updateField("wlan5ghzWpa2Security", null);
    PopupView.updateField("wlan5ghzMaxClients", null);
    PopupView.updateField("dhcpEnabled", null);
    PopupView.updateField("dhcpIpAddress", null);
    PopupView.updateField("dhcpSubnetMask", null);
    PopupView.updateField("dhcpStartIp", null);
    PopupView.updateField("dhcpEndIp", null);
    PopupView.updateField("dhcpIspDnsEnabled", null);
    PopupView.updateField("dhcpPrimaryDns", null);
    PopupView.updateField("dhcpSecondaryDns", null);
    PopupView.updateField("dhcpLeaseTimeMode", null);
    PopupView.updateField("dhcpLeaseTime", null);
    PopupView.updateField("upnpEnabled", null);
    PopupView.updateField("routerVersion", null);
    PopupView.updateField("tr069Url", null);
    for (const band of ["24ghz", "5ghz", "cable"] as const) {
      this.clearTopologyBand(band);
    }
    const select = document.querySelector(
      "#popup-diagnostics-device-select"
    ) as HTMLSelectElement | null;
    if (select) {
      select.innerHTML = "";
      select.disabled = true;
    }
    const output = document.querySelector(
      "#popup-diagnostics-output"
    ) as HTMLTextAreaElement | null;
    if (output) {
      output.value = "";
    }
    PopupView.clearLogs();
    this.persistedLogs = [];
    void this.persistUiState();
    const storageKey = this.getTabStorageKey(LAST_DATA_STORAGE_KEY);
    if (storageKey !== null) {
      void SessionStorageService.remove(storageKey);
    }
  }

  private async loadPersistedData(): Promise<void> {
    const last = await this.uiStateService.loadLastExtraction(this.activeTabId);
    if (!last) return;
    this.currentData = last;
    this.renderData();
  }

  private async persistCurrentData(): Promise<void> {
    if (this.currentData === null) return;

    await this.uiStateService.saveLastExtraction(
      this.activeTabId,
      this.currentData
    );
  }

  private async loadPersistedUiState(): Promise<void> {
    const state = await this.uiStateService.loadUiState(this.activeTabId);
    if (!state) return;

    this.persistedStatus = state.status;
    this.persistedLogs = state.logs.slice(0, 50);

    PopupView.setStatus(state.status.type, state.status.text);
    PopupView.clearLogs();
    for (let index = this.persistedLogs.length - 1; index >= 0; index--) {
      const entry = this.persistedLogs[index];
      if (!entry) continue;
      PopupView.log(entry.msg, entry.type, entry.time);
    }
  }

  private async persistUiState(): Promise<void> {
    const state: PopupUiState = {
      status: this.persistedStatus,
      logs: this.persistedLogs,
    };
    await this.uiStateService.saveUiState(this.activeTabId, state);
  }

  private setStatus(type: PopupStatusType, text: string): void {
    this.persistedStatus = { type, text };
    PopupView.setStatus(type, text);
    void this.persistUiState();
  }

  private log(msg: string, type: PopupStatusType = PopupStatusType.NONE): void {
    const time = new Date().toLocaleTimeString(undefined, { hour12: false });
    this.persistedLogs.unshift({ msg, type, time });
    if (this.persistedLogs.length > 30) {
      this.persistedLogs = this.persistedLogs.slice(0, 30);
    }
    PopupView.log(msg, type, time);
    void this.persistUiState();
  }

  private toStatusText(value: boolean | undefined): string | null {
    if (value === undefined) return null;
    return value
      ? translator.t("popup_status_enabled")
      : translator.t("popup_status_disabled");
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private getResponseMessage(response: unknown): string {
    const fallback = translator.t("popup_error_unknown_response");

    if (!response || typeof response !== "object") {
      return fallback;
    }

    const message = (response as { message?: unknown }).message;
    if (typeof message !== "string" || message.trim() === "") {
      return fallback;
    }

    const normalized = this.parseZodIssuesFromString(message);
    return normalized ?? message;
  }

  private parseZodIssuesFromString(raw: string): string | null {
    const value = raw.trim();
    if (!value.startsWith("[") || !value.endsWith("]")) {
      return null;
    }

    try {
      const parsed = JSON.parse(value) as Array<{ message?: unknown }>;
      if (!Array.isArray(parsed)) {
        return null;
      }

      const messages = parsed
        .map((issue) =>
          typeof issue?.message === "string" ? issue.message : null
        )
        .filter((item): item is string => item !== null && item.trim() !== "");

      return messages.length > 0 ? messages.join("; ") : null;
    } catch {
      return null;
    }
  }

  private isExpectedNavigationError(errorMessage: string): boolean {
    const normalizedError = errorMessage.toLowerCase();
    return PopupController.EXPECTED_NAVIGATION_ERROR_SNIPPETS.some((snippet) =>
      normalizedError.includes(snippet)
    );
  }

  private async updateRouterModel(): Promise<boolean> {
    const routerModelElement = DomService.getElement(
      "#popup-router-model",
      HTMLElement
    );
    const storageKey = this.getTabStorageKey(ROUTER_MODEL_STORAGE_KEY);

    if (storageKey === null) {
      routerModelElement.textContent = translator.t("popup_model_not_detected");
      return false;
    }

    try {
      const model = await SessionStorageService.get<string>(storageKey);
      this.routerModel =
        typeof model === "string" && model.trim() !== "" ? model : null;
      routerModelElement.textContent =
        this.routerModel !== null
          ? this.routerModel
          : translator.t("popup_model_not_detected");
      return this.routerModel !== null;
    } catch {
      routerModelElement.textContent = translator.t("popup_model_not_detected");
      this.routerModel = null;
      return false;
    }
  }

  private setCollectButtonEnabled(enabled: boolean): void {
    DomService.getElement("#popup-btn-collect", HTMLButtonElement).disabled =
      !enabled;
  }

  private setCopyTextButtonEnabled(enabled: boolean): void {
    DomService.getElement("#popup-btn-copy-text", HTMLButtonElement).disabled =
      !enabled;
  }

  private setPingButtonEnabled(enabled: boolean): void {
    DomService.getElement(
      "#popup-diagnostics-btn-ping",
      HTMLButtonElement
    ).disabled = !enabled;
  }

  private setCopyResultButtonEnabled(enabled: boolean): void {
    DomService.getElement(
      "#popup-diagnostics-btn-copy-result",
      HTMLButtonElement
    ).disabled = !enabled;
  }

  private getTabStorageKey(baseKey: string): string | null {
    if (this.activeTabId === null) return null;
    return `${baseKey}:${String(this.activeTabId)}`;
  }

  private async loadBookmarks(): Promise<void> {
    const container = DomService.getElement(
      "#popup-saved-credentials-container",
      HTMLElement
    );
    const list = DomService.getElement(
      "#popup-saved-credentials-list",
      HTMLUListElement
    );

    if (!container || !list || !this.routerModel) {
      if (container) container.classList.add("popup-hidden");
      if (list) list.innerHTML = "";
      return;
    }

    const modelEntry =
      (await this.bookmarksService.listByModel(this.routerModel)) ??
      ({
        model: this.routerModel,
        credentials: [],
      } as BookmarkStore[string]);

    list.innerHTML = "";

    if (!modelEntry.credentials.length) {
      const noDataItem = document.createElement("li");
      noDataItem.className = "popup-saved-credentials-no-data";
      noDataItem.textContent = translator.t("popup_saved_credentials_no_data");
      list.appendChild(noDataItem);
      return;
    }

    const createCredentialItem = (
      cred: CredentialBookmark,
      index: number
    ): HTMLElement => {
      const li = document.createElement("li");
      const usernameContainer = document.createElement("div");
      const passwordContainer = document.createElement("div");
      const usernameLabelSpan = document.createElement("span");
      const passwordLabelSpan = document.createElement("span");
      const usernameValueSpan = document.createElement("span");
      const passwordValueSpan = document.createElement("span");
      const deleteButton = document.createElement("button");
      const deleteIcon = document.createElement("span");

      usernameLabelSpan.textContent = `${translator.t(
        "popup_credentials_user_label"
      )}:`;
      passwordLabelSpan.textContent = `${translator.t(
        "popup_credentials_password_label"
      )}:`;
      usernameValueSpan.textContent = cred.username;
      passwordValueSpan.textContent = cred.password;

      usernameLabelSpan.className = "popup-saved-credential-label";
      passwordLabelSpan.className = "popup-saved-credential-label";
      usernameValueSpan.className = "popup-saved-credential-value";
      passwordValueSpan.className = "popup-saved-credential-value";
      usernameContainer.className = "popup-saved-credential-field";
      passwordContainer.className = "popup-saved-credential-field";

      usernameContainer.append(usernameLabelSpan, usernameValueSpan);
      passwordContainer.append(passwordLabelSpan, passwordValueSpan);

      deleteButton.type = "button";
      deleteButton.className = "popup-saved-credential-delete";
      deleteButton.title = translator.t("popup_saved_credentials_delete_title");

      deleteIcon.className = "popup-icon popup-icon-bookmark--delete";
      deleteIcon.setAttribute("aria-hidden", "true");

      deleteButton.appendChild(deleteIcon);

      li.className = "popup-saved-credential-item";
      li.append(usernameContainer, passwordContainer, deleteButton);
      li.title = translator.t("popup_saved_credentials_use_title");
      li.addEventListener("click", () => {
        const userInput = DomService.getInputElement("#popup-input-username");
        const passInput = DomService.getInputElement("#popup-input-password");
        DomService.updateField(userInput, cred.username);
        DomService.updateField(passInput, cred.password);

        if (this.activeTabId !== null) {
          void chrome.tabs.sendMessage(this.activeTabId, {
            action: ContentPageMessageAction.FILL_LOGIN_FIELDS,
            credentials: { username: cred.username, password: cred.password },
          });
        }
      });

      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        void this.deleteCredentialAtIndex(index);
      });

      return li;
    };

    modelEntry.credentials.forEach((cred, index) => {
      const li = createCredentialItem(cred, index);
      list.appendChild(li);
    });

    const first = modelEntry.credentials[0];
    if (first) {
      const userInput = DomService.getInputElement("#popup-input-username");
      const passInput = DomService.getInputElement("#popup-input-password");
      DomService.updateField(userInput, first.username);
      DomService.updateField(passInput, first.password);
    }
  }

  private async handleSaveCredentials(): Promise<void> {
    if (!this.routerModel) {
      this.setStatus(
        PopupStatusType.WARN,
        translator.t("popup_error_router_model_not_detected")
      );
      return;
    }

    const user = DomService.getValueElement(
      "#popup-input-username"
    ).value.trim();
    const pass = DomService.getValueElement("#popup-input-password").value;

    if (!user || !pass) {
      this.setStatus(
        PopupStatusType.WARN,
        translator.t("popup_error_save_missing_fields")
      );
      return;
    }

    const result = await this.bookmarksService.addCredential(this.routerModel, {
      username: user,
      password: pass,
    });

    if (result.kind === "max_reached") {
      this.setStatus(
        PopupStatusType.WARN,
        translator.t("popup_error_max_bookmarks")
      );
      return;
    }

    await this.loadBookmarks();
    this.setStatus(
      PopupStatusType.OK,
      translator.t("popup_status_bookmark_saved")
    );
  }

  private async deleteCredentialAtIndex(index: number): Promise<void> {
    if (!this.routerModel) return;

    await this.bookmarksService.removeCredential(this.routerModel, index);
    await this.loadBookmarks();
    this.setStatus(
      PopupStatusType.OK,
      translator.t("popup_status_bookmark_removed")
    );
  }

  private async handleBookmarkButton(): Promise<void> {
    const container = DomService.getElement(
      "#popup-saved-credentials-container",
      HTMLElement
    );
    if (container.classList.contains("popup-hidden")) {
      await this.loadBookmarks();
      const list = DomService.getElement(
        "#popup-saved-credentials-list",
        HTMLUListElement
      );
      const hasCredentials =
        list && !list.querySelector(".popup-saved-credentials-no-data");
      if (hasCredentials) {
        container.classList.remove("popup-hidden");
      }
    } else {
      container.classList.add("popup-hidden");
    }
  }
}
