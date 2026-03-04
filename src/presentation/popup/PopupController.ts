import {
  ExtractionResultSchema,
  type ExtractionResult,
} from "../../domain/schemas/validation.js";
import { DomService } from "../../infra/dom/DomService.js";
import { PopupView } from "../../infra/dom/PopupView.js";
import { StorageService } from "../../infra/storage/StorageService.js";
import { PopupStatusType } from "../../application/types/index.js";
import type { CollectResponse } from "../../application/types/index.js";
import type { BookmarkStore, CredentialBookmark } from "./index.js";
import {
  BOOKMARKS_STORAGE_KEY,
  LAST_DATA_STORAGE_KEY,
  MAX_BOOKMARK_CREDENTIALS,
  PENDING_AUTH_ERROR_STORAGE_KEY,
  ROUTER_MODEL_STORAGE_KEY,
  UI_STATE_STORAGE_KEY,
} from "../../application/constants/index.js";

/** Presentation controller: drives popup UI and Chrome messaging. */
export class PopupController {
  private currentData: ExtractionResult | null = null;
  private activeTabId: number | null = null;
  private routerModel: string | null = null;
  private persistedStatus: { type: PopupStatusType; text: string } = {
    type: PopupStatusType.NONE,
    text: "Ready to collect router data",
  };
  private persistedLogs: Array<{
    msg: string;
    type: PopupStatusType;
    time: string;
  }> = [];

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
    DomService.getElement("#popup-btn-save-credentials", HTMLElement).addEventListener(
      "click",
      () => void this.handleSaveCredentials()
    );
    DomService.getElement(
      "#popup-btn-toggle-bookmarks",
      HTMLElement
    ).addEventListener("click", () => void this.handleBookmarkButton());
  }

  private async handleCollect(): Promise<void> {
    const user =
      DomService.getValueElement("#popup-input-username").value.trim() || "admin";
    const pass = DomService.getValueElement("#popup-input-password").value;

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) {
      this.setStatus(
        PopupStatusType.ERROR,
        "Cannot find an active browser tab. Open your router page and try again"
      );
      this.log(
        "No active browser tab detected while starting collection",
        PopupStatusType.ERROR
      );
      return;
    }

    try {
      const response = (await chrome.tabs.sendMessage(tab.id, {
        action: "authenticate",
        credentials: { username: user, password: pass },
      })) as CollectResponse | undefined;

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
        this.log(
          "Router page is redirecting after login. Retrying collection...",
          PopupStatusType.WARN
        );
        await this.startRetryLoop(tab.id);
        return;
      }

      this.setStatus(
        PopupStatusType.ERROR,
        "Failed to communicate with the router page. Make sure it is open and reachable, then try again"
      );
      this.log(errorMessage, PopupStatusType.ERROR);
    }
  }

  private async startRetryLoop(tabId: number): Promise<void> {
    const maxRetries = 5;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.log(
        `Retrying collection (${attempt}/${maxRetries}) while waiting for the router page to finish loading...`
      );

      try {
        const res = (await chrome.tabs.sendMessage(tabId, {
          action: "collect",
        })) as CollectResponse | undefined;

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
      PopupStatusType.ERROR,
      "Timed out waiting for the router page to be ready. Refresh the page and try again"
    );
    this.log(
      "Timed out waiting for the router page to become ready",
      PopupStatusType.ERROR
    );
  }

  private processResponse(response: CollectResponse): void {
    const result = ExtractionResultSchema.safeParse({
      ...response.data,
      timestamp: new Date().toISOString(),
    });

    if (!result.success) {
      this.setStatus(
        PopupStatusType.WARN,
        "Router returned data in an unexpected format. Refresh the router page and try again"
      );
      return;
    }

    this.currentData = result.data;
    this.renderData();
    void this.persistCurrentData();
    this.setStatus(PopupStatusType.OK, "Router data collected successfully");
  }

  private renderData(): void {
    if (this.currentData === null) return;

    const data = this.currentData;
    PopupView.updateField("pppoeUsername", data?.ppoeUsername ?? null);
    PopupView.updateField(
      "internetStatus",
      this.toStatusText(data?.internetStatus)
    );
    PopupView.updateField("tr069Status", this.toStatusText(data?.tr069Status));
    PopupView.updateField("ipVersion", data?.ipVersion ?? null);
    PopupView.updateField(
      "requestPdStatus",
      this.toStatusText(data?.requestPdStatus)
    );
    PopupView.updateField("slaacStatus", this.toStatusText(data?.slaacStatus));
    PopupView.updateField(
      "dhcpv6Status",
      this.toStatusText(data?.dhcpv6Status)
    );
    PopupView.updateField("pdStatus", this.toStatusText(data?.pdStatus));
    PopupView.updateField("linkSpeed", data?.linkSpeed ?? null);
    PopupView.updateField(
      "remoteAccessIpv4Status",
      this.toStatusText(data?.remoteAccessIpv4Status)
    );
    PopupView.updateField(
      "remoteAccessIpv6Status",
      this.toStatusText(data?.remoteAccessIpv6Status)
    );
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
    this.setStatus(PopupStatusType.NONE, "Ready to collect router data");
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
    PopupView.clearLogs();
    this.persistedLogs = [];
    void this.persistUiState();
    const storageKey = this.getTabStorageKey(LAST_DATA_STORAGE_KEY);
    if (storageKey !== null) {
      void StorageService.remove(storageKey);
    }
  }

  private async loadPersistedData(): Promise<void> {
    const storageKey = this.getTabStorageKey(LAST_DATA_STORAGE_KEY);
    if (storageKey === null) return;

    const rawData = await StorageService.get<unknown>(storageKey);
    if (!rawData) return;

    const parsed = ExtractionResultSchema.safeParse(rawData);
    if (!parsed.success) {
      await StorageService.remove(storageKey);
      return;
    }

    this.currentData = parsed.data;
    this.renderData();
  }

  private async persistCurrentData(): Promise<void> {
    if (this.currentData === null) return;
    const storageKey = this.getTabStorageKey(LAST_DATA_STORAGE_KEY);
    if (storageKey === null) return;

    await StorageService.save(storageKey, this.currentData, 24 * 60 * 1000);
  }

  private async loadPersistedUiState(): Promise<void> {
    const storageKey = this.getTabStorageKey(UI_STATE_STORAGE_KEY);
    if (storageKey === null) return;

    const state = await StorageService.get<{
      status?: { type?: PopupStatusType; text?: string };
      logs?: Array<{ msg?: string; type?: string; time?: string }>;
    }>(storageKey);
    if (!state) return;

    const statusType = state.status?.type;
    const statusText = state.status?.text;
    if (statusType && typeof statusText === "string") {
      this.persistedStatus = { type: statusType, text: statusText };
      PopupView.setStatus(statusType, statusText);
    }

    if (Array.isArray(state.logs)) {
      const logs = state.logs.filter(
        (log) =>
          typeof log?.msg === "string" &&
          log?.type &&
          typeof log?.time === "string"
      ) as Array<{ msg: string; type: PopupStatusType; time: string }>;

      this.persistedLogs = logs.slice(0, 50);
      PopupView.clearLogs();
      for (let index = this.persistedLogs.length - 1; index >= 0; index--) {
        const entry = this.persistedLogs[index];
        if (!entry) continue;
        PopupView.log(entry.msg, entry.type, entry.time);
      }
    }
  }

  private async persistUiState(): Promise<void> {
    const storageKey = this.getTabStorageKey(UI_STATE_STORAGE_KEY);
    if (storageKey === null) return;

    await StorageService.save(
      storageKey,
      {
        status: this.persistedStatus,
        logs: this.persistedLogs,
      },
      24 * 60 * 1000
    );
  }

  private setStatus(type: PopupStatusType, text: string): void {
    this.persistedStatus = { type, text };
    PopupView.setStatus(type, text);
    void this.persistUiState();
  }

  private log(msg: string, type: PopupStatusType = PopupStatusType.NONE): void {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    this.persistedLogs.unshift({ msg, type, time });
    if (this.persistedLogs.length > 50) {
      this.persistedLogs = this.persistedLogs.slice(0, 50);
    }
    PopupView.log(msg, type, time);
    void this.persistUiState();
  }

  private toStatusText(value: boolean | undefined): string | null {
    if (value === undefined) return null;
    return value ? "Enabled" : "Disabled";
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private getResponseMessage(response: unknown): string {
    const fallback = "Unknown response format";

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
      routerModelElement.textContent = "Not detected";
      return false;
    }

    try {
      const model = await StorageService.get<string>(storageKey);
      this.routerModel =
        typeof model === "string" && model.trim() !== "" ? model : null;
      routerModelElement.textContent =
        this.routerModel !== null ? this.routerModel : "Not detected";
      return this.routerModel !== null;
    } catch {
      routerModelElement.textContent = "Not detected";
      this.routerModel = null;
      return false;
    }
  }

  private setCollectButtonEnabled(enabled: boolean): void {
    DomService.getElement("#popup-btn-collect", HTMLButtonElement).disabled = !enabled;
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
    const list = DomService.getElement("#popup-saved-credentials-list", HTMLUListElement);

    if (!container || !list || !this.routerModel) {
      if (container) container.classList.add("popup-hidden");
      if (list) list.innerHTML = "";
      return;
    }

    const store =
      (await StorageService.get<BookmarkStore>(BOOKMARKS_STORAGE_KEY)) ?? {};

    const modelEntry = store[this.routerModel] ?? {
      model: this.routerModel,
      credentials: [],
    };

    list.innerHTML = "";

    if (!modelEntry.credentials.length) {
      container.classList.add("popup-hidden");
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
      const deleteIcon = document.createElement("img");

      usernameLabelSpan.textContent = "User:";
      passwordLabelSpan.textContent = "Password:";
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
      deleteButton.title = `Delete saved credentials #${index + 1}`;

      deleteIcon.src = "assets/trash.svg";
      deleteIcon.alt = "Delete saved credentials";
      deleteIcon.className = "popup-icon";

      deleteButton.appendChild(deleteIcon);

      li.className = "popup-saved-credential-item";
      li.append(usernameContainer, passwordContainer, deleteButton);
      li.title = `Use saved credentials #${index + 1}`;
      li.addEventListener("click", () => {
        const userInput = DomService.getInputElement("#popup-input-username");
        const passInput = DomService.getInputElement("#popup-input-password");
        DomService.updateField(userInput, cred.username);
        DomService.updateField(passInput, cred.password);
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
        "Router model not detected. Cannot save credentials"
      );
      return;
    }

    const user = DomService.getValueElement("#popup-input-username").value.trim();
    const pass = DomService.getValueElement("#popup-input-password").value;

    if (!user || !pass) {
      this.setStatus(
        PopupStatusType.WARN,
        "Provide both username and password before saving"
      );
      return;
    }

    const store =
      (await StorageService.get<BookmarkStore>(BOOKMARKS_STORAGE_KEY)) ?? {};

    const existing = store[this.routerModel] ?? {
      model: this.routerModel,
      credentials: [],
    };

    const updatedCredentials = [...existing.credentials];

    if (updatedCredentials.length >= MAX_BOOKMARK_CREDENTIALS) {
      this.setStatus(
        PopupStatusType.WARN,
        "Maximum number of bookmarks reached. Remove some bookmarks to save new ones"
      );
      return;
    }

    updatedCredentials.push({ username: user, password: pass });

    store[this.routerModel] = {
      model: this.routerModel,
      credentials: updatedCredentials.slice(0, MAX_BOOKMARK_CREDENTIALS),
    };

    await StorageService.save(BOOKMARKS_STORAGE_KEY, store);

    await this.loadBookmarks();
    this.setStatus(PopupStatusType.OK, "Credentials saved to bookmark list");
  }

  private async deleteCredentialAtIndex(index: number): Promise<void> {
    if (!this.routerModel) return;

    const store =
      (await StorageService.get<BookmarkStore>(BOOKMARKS_STORAGE_KEY)) ?? {};
    const existing = store[this.routerModel];
    if (!existing) return;

    const updatedCredentials = [...existing.credentials];
    if (index < 0 || index >= updatedCredentials.length) return;

    updatedCredentials.splice(index, 1);

    if (updatedCredentials.length === 0) {
      delete store[this.routerModel];
    } else {
      store[this.routerModel] = {
        model: existing.model,
        credentials: updatedCredentials,
      };
    }

    await StorageService.save(BOOKMARKS_STORAGE_KEY, store);
    await this.loadBookmarks();
    this.setStatus(PopupStatusType.OK, "Credential removed from bookmark list");
  }

  private async handleBookmarkButton(): Promise<void> {
    const container = DomService.getElement(
      "#popup-saved-credentials-container",
      HTMLElement
    );
    if (container.classList.contains("popup-hidden")) {
      await this.loadBookmarks();
      container.classList.remove("popup-hidden");
    } else {
      container.classList.add("popup-hidden");
    }
  }
}
