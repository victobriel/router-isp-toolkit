import {
  LAST_DATA_STORAGE_KEY,
  PENDING_AUTH_ERROR_STORAGE_KEY,
  ROUTER_MODEL_STORAGE_KEY,
} from "../../application/constants/index.js";
import { PopupStatusType } from "../../application/types/index.js";
import {
  ExtractionResultSchema,
  type ExtractionResult,
} from "../../domain/schemas/validation.js";
import { DomService } from "../../infra/dom/DomService.js";
import { StorageService } from "../../infra/storage/StorageService.js";

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

/** Presentation controller: drives popup UI and Chrome messaging. */
export class PopupController {
  private currentData: ExtractionResult | null = null;
  private activeTabId: number | null = null;
  private routerModel: string | null = null;
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

  constructor() {
    this.setupListeners();
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.resolveActiveTab();
    const isModelDetected = await this.updateRouterModel();
    this.setCollectButtonEnabled(isModelDetected);
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
    DomService.getElement(
      "#popup-btn-save-credentials",
      HTMLElement
    ).addEventListener("click", () => void this.handleSaveCredentials());
    DomService.getElement(
      "#popup-btn-toggle-bookmarks",
      HTMLElement
    ).addEventListener("click", () => void this.handleBookmarkButton());
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
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "authenticate",
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
        const res = await chrome.tabs.sendMessage(tabId, {
          action: "collect",
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
    PopupView.updateField(
      "wlan24ghzStatus",
      this.toStatusText(data?.wlan24GhzConfig?.enabled) ?? null
    );
    PopupView.updateField(
      "wlan24ghzChannel",
      String(data?.wlan24GhzConfig?.channel ?? null)
    );
    PopupView.updateField(
      "wlan24ghzBandWidth",
      data?.wlan24GhzConfig?.bandWidth ?? null
    );
    PopupView.updateField(
      "wlan24ghzTransmittingPower",
      data?.wlan24GhzConfig?.transmittingPower ?? null
    );
    PopupView.updateField("wlan24ghzMode", data?.wlan24GhzConfig?.mode ?? null);
    PopupView.updateField(
      "wlan24ghzSsidName",
      data?.wlan24GhzConfig?.ssidName ?? null
    );
    PopupView.updateField(
      "wlan24ghzSsidPassword",
      data?.wlan24GhzConfig?.ssidPassword ?? null
    );
    PopupView.updateField(
      "wlan24ghzSsidHideMode",
      data?.wlan24GhzConfig?.ssidHideMode ?? null
    );
    PopupView.updateField(
      "wlan24ghzWpa2Security",
      data?.wlan24GhzConfig?.wpa2SecurityType ?? null
    );
    PopupView.updateField(
      "wlan24ghzMaxClients",
      String(data?.wlan24GhzConfig?.maxClients ?? null)
    );
    PopupView.updateField(
      "wlan5ghzStatus",
      this.toStatusText(data?.wlan5GhzConfig?.enabled) ?? null
    );
    PopupView.updateField(
      "wlan5ghzChannel",
      String(data?.wlan5GhzConfig?.channel ?? null)
    );
    PopupView.updateField(
      "wlan5ghzBandWidth",
      data?.wlan5GhzConfig?.bandWidth ?? null
    );
    PopupView.updateField(
      "wlan5ghzTransmittingPower",
      data?.wlan5GhzConfig?.transmittingPower ?? null
    );
    PopupView.updateField("wlan5ghzMode", data?.wlan5GhzConfig?.mode ?? null);
    PopupView.updateField(
      "wlan5ghzSsidName",
      data?.wlan5GhzConfig?.ssidName ?? null
    );
    PopupView.updateField(
      "wlan5ghzSsidPassword",
      data?.wlan5GhzConfig?.ssidPassword ?? null
    );
    PopupView.updateField(
      "wlan5ghzSsidHideMode",
      data?.wlan5GhzConfig?.ssidHideMode ?? null
    );
    PopupView.updateField(
      "wlan5ghzWpa2Security",
      data?.wlan5GhzConfig?.wpa2SecurityType ?? null
    );
    PopupView.updateField(
      "wlan5ghzMaxClients",
      String(data?.wlan5GhzConfig?.maxClients ?? null)
    );
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
    const topology = data?.topology;
    if (topology) {
      for (const band of ["24ghz", "5ghz", "cable"] as const) {
        this.renderTopologyBand(band, topology[band].clients);
      }
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

  private async checkPendingErrors(): Promise<void> {
    const pendingAuthError = await StorageService.get<string>(
      PENDING_AUTH_ERROR_STORAGE_KEY
    );
    if (pendingAuthError !== null && pendingAuthError !== "") {
      await StorageService.remove(PENDING_AUTH_ERROR_STORAGE_KEY);
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
    for (const band of ["24ghz", "5ghz", "cable"] as const) {
      this.clearTopologyBand(band);
    }
    PopupView.clearLogs();
    this.persistedLogs = [];
    void this.persistUiState();
    const storageKey = this.getTabStorageKey(LAST_DATA_STORAGE_KEY);
    if (storageKey !== null) {
      void StorageService.remove(storageKey);
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
      const model = await StorageService.get<string>(storageKey);
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

  private getTabStorageKey(baseKey: string): string | null {
    if (this.activeTabId === null) return null;
    return `${baseKey}-${this.activeTabId}`;
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
            action: "fillLoginFields",
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
