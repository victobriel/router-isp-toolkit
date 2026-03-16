import { StorageService } from "../../infra/storage/StorageService.js";
import { ThemeManager } from "../popup/ThemeManager.js";
import { translator } from "../../infra/i18n/I18nService.js";

import { defaultBookmarksService } from "../../application/BookmarksService.js";
import {
  COPY_TEXT_TEMPLATE_STORAGE_KEY,
  ROUTER_PREFERENCES_STORAGE_KEY,
} from "../../application/constants/index.js";

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(msg: string, variant: "ok" | "err" = "ok"): void {
  const toast = document.getElementById("settings-toast");

  if (!toast) return;

  if (toastTimer !== null) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }

  toast.textContent = msg;
  toast.className = `settings-toast settings-toast--${variant} settings-toast--visible`;

  toastTimer = setTimeout(() => {
    toast.className = `settings-toast settings-toast--${variant}`;
    toastTimer = null;
  }, 3000);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadBookmarks(): Promise<void> {
  const countEl = document.getElementById("settings-bookmark-count");
  const listEl = document.getElementById("settings-bookmarks-list");

  const summary = await defaultBookmarksService.getSummary();
  const entries = summary.entries;
  const total = summary.total;

  if (countEl) countEl.textContent = String(total);

  if (!listEl) return;

  if (total === 0) {
    const div = document.createElement("div");
    div.className = "settings-bookmarks-empty";
    div.textContent = translator.t("settings_bookmarks_empty");
    listEl.appendChild(div);
    return;
  }

  listEl.innerHTML = "";
  for (const [modelKey, { model, credentials }] of entries) {
    const container = document.createElement("div");
    container.className = "settings-bookmark-group";
    const header = document.createElement("div");
    header.className = "settings-bookmark-group-header";
    header.textContent = escapeHtml(model);
    container.appendChild(header);
    const entriesContainer = document.createElement("div");
    entriesContainer.className = "settings-bookmark-entries";
    credentials.forEach(({ username, password }, credIdx) => {
      const entry = document.createElement("div");
      entry.className = "settings-bookmark-entry";
      const usernameSpan = document.createElement("span");
      usernameSpan.className = "settings-bookmark-username";
      usernameSpan.textContent = escapeHtml(username);
      entry.appendChild(usernameSpan);
      const passwordSpan = document.createElement("span");
      passwordSpan.className = "settings-bookmark-password";
      passwordSpan.textContent = escapeHtml(password);
      entry.appendChild(passwordSpan);
      const deleteButton = document.createElement("button");
      deleteButton.className = "settings-bookmark-delete";
      deleteButton.dataset.modelKey = modelKey;
      deleteButton.dataset.credIdx = String(credIdx);
      deleteButton.title = translator.t("settings_bookmarks_delete_title");
      deleteButton.type = "button";
      deleteButton.ariaLabel = translator.t(
        "settings_bookmarks_delete_aria",
        escapeHtml(username)
      );
      deleteButton.innerHTML = `<span class="settings-icon settings-icon--trash" aria-hidden="true"></span>`;
      entry.appendChild(deleteButton);
      entriesContainer.appendChild(entry);
    });
    container.appendChild(entriesContainer);
    listEl.appendChild(container);
  }
}

async function deleteCredential(
  modelKey: string,
  credIdx: number
): Promise<void> {
  await defaultBookmarksService.removeCredential(modelKey, credIdx);
  await loadBookmarks();
  showToast(translator.t("settings_toast_credential_removed"), "ok");
}

async function loadCopyTemplate(): Promise<void> {
  const textarea = document.getElementById(
    "settings-copy-template-input"
  ) as HTMLTextAreaElement | null;
  if (!textarea) return;

  const stored = await StorageService.get<string>(
    COPY_TEXT_TEMPLATE_STORAGE_KEY
  );
  textarea.value =
    typeof stored === "string" && stored.trim() !== "" ? stored : "";
}

type RouterPreferences = Record<string, string>;

async function loadRouterPreferences(): Promise<void> {
  const stored = await StorageService.get<RouterPreferences>(
    ROUTER_PREFERENCES_STORAGE_KEY
  );
  const prefs = stored && typeof stored === "object" ? stored : {};

  document.querySelectorAll<HTMLInputElement>("[data-pref-key]").forEach((el) => {
    const key = el.getAttribute("data-pref-key");
    if (!key) return;
    const value = prefs[key];
    el.value = typeof value === "string" ? value : "";
  });
}

function setupRouterPreferences(): void {
  const saveBtn = document.getElementById("settings-router-preferences-save");
  if (!saveBtn) return;

  saveBtn.addEventListener("click", async () => {
    const prefs: RouterPreferences = {};
    document
      .querySelectorAll<HTMLInputElement>("[data-pref-key]")
      .forEach((el) => {
        const key = el.getAttribute("data-pref-key");
        if (!key) return;
        const value = el.value.trim();
        prefs[key] = value;
      });

    await StorageService.save(ROUTER_PREFERENCES_STORAGE_KEY, prefs);
    showToast(translator.t("settings_router_preferences_toast_saved"), "ok");
  });
}

function setupCopyTemplate(): void {
  const textarea = document.getElementById(
    "settings-copy-template-input"
  ) as HTMLTextAreaElement | null;
  const saveBtn = document.getElementById(
    "settings-copy-template-save"
  ) as HTMLButtonElement | null;

  if (!textarea || !saveBtn) return;

  saveBtn.addEventListener("click", async () => {
    const raw = textarea.value.trim();
    if (!raw) {
      showToast(translator.t("settings_copy_template_error_empty"), "err");
      return;
    }

    await StorageService.save(COPY_TEXT_TEMPLATE_STORAGE_KEY, raw);
    showToast(translator.t("settings_copy_template_toast_saved"), "ok");
  });
}

function setupBookmarksList(): void {
  const listEl = document.getElementById("settings-bookmarks-list");
  if (!listEl) return;

  listEl.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>(
      ".settings-bookmark-delete"
    );
    if (!btn) return;

    const modelKey = btn.dataset.modelKey;
    const credIdx = parseInt(btn.dataset.credIdx ?? "", 10);
    if (!modelKey || isNaN(credIdx)) return;

    void deleteCredential(modelKey, credIdx);
  });
}

function applySettingsTranslations(): void {
  try {
    const uiLang = chrome?.i18n?.getUILanguage?.() ?? "en";
    const shortLang = uiLang.split("-")[0] || uiLang;
    document.documentElement.lang = shortLang;
  } catch {
    // ignore language errors
  }

  // Header and document title
  const title = document.querySelector<HTMLHeadingElement>(".settings-title");
  if (title) title.textContent = translator.t("settings_header_title");
  const subtitle =
    document.querySelector<HTMLSpanElement>(".settings-subtitle");
  if (subtitle) subtitle.textContent = translator.t("settings_header_subtitle");
  const docTitle = translator.t("settings_title");
  if (docTitle) document.title = docTitle;

  // Generic text translations
  const textNodes = document.querySelectorAll<HTMLElement>("[data-i18n]");
  textNodes.forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    el.textContent = translator.t(key);
  });

  // Generic aria-label translations
  const ariaLabelNodes = document.querySelectorAll<HTMLElement>(
    "[data-i18n-aria-label]"
  );
  ariaLabelNodes.forEach((el) => {
    const key = el.dataset.i18nAriaLabel;
    if (!key) return;
    el.setAttribute("aria-label", translator.t(key));
  });

  // Generic title translations
  const titleNodes =
    document.querySelectorAll<HTMLElement>("[data-i18n-title]");
  titleNodes.forEach((el) => {
    const key = el.dataset.i18nTitle;
    if (!key) return;
    el.setAttribute("title", translator.t(key));
  });

  // Theme toggle labels (reuse popup theme keys)
  const themeButtons = document.querySelectorAll<HTMLButtonElement>(
    ".theme-toggle-option"
  );
  themeButtons.forEach((btn) => {
    const theme = btn.dataset.theme;
    if (theme === "light") btn.textContent = translator.t("popup_theme_light");
    else if (theme === "dark")
      btn.textContent = translator.t("popup_theme_dark");
    else if (theme === "system")
      btn.textContent = translator.t("popup_theme_system");
  });
}

function setupAccordion(): void {
  const trigger = document.getElementById("settings-bookmarks-trigger");
  const panel = document.getElementById("settings-bookmarks-panel");
  if (!trigger || !panel) return;

  const toggle = (): void => {
    const isOpen = trigger.getAttribute("aria-expanded") === "true";
    trigger.setAttribute("aria-expanded", String(!isOpen));
    panel.classList.toggle("is-open", !isOpen);
  };

  trigger.addEventListener("click", toggle);
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });
}

function setupClearAll(): void {
  const btn = document.getElementById("settings-btn-clear-all");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    await StorageService.clear();
    await loadBookmarks();
    showToast(translator.t("settings_toast_all_cleared"), "ok");
  });
}

function setupVersion(): void {
  const el = document.getElementById("settings-version");
  if (!el) return;
  const manifest = chrome.runtime.getManifest();
  el.textContent = manifest.version;
}

document.addEventListener("DOMContentLoaded", () => {
  new ThemeManager();
  void (async () => {
    applySettingsTranslations();
    setupVersion();
    setupAccordion();
    setupBookmarksList();
    setupClearAll();
    setupCopyTemplate();
    setupRouterPreferences();
    await loadBookmarks();
    await loadCopyTemplate();
    await loadRouterPreferences();
  })();
});
