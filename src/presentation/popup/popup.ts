import { PopupController } from "./PopupController.js";
import { ThemeManager } from "./ThemeManager.js";
import { translator } from "../../infra/i18n/I18nService.js";

enum tabElement {
  MAIN = "main",
  TOPOLOGY = "topology",
  // LOGS = "logs",
  DIAGNOSTICS = "diagnostics",
}

function applyPopupTranslations(): void {
  try {
    const uiLang = chrome?.i18n?.getUILanguage?.() ?? "en";
    const shortLang = uiLang.split("-")[0] || uiLang;
    document.documentElement.lang = shortLang;
  } catch {
    // ignore language errors
  }

  const headerTitle =
    document.querySelector<HTMLHeadingElement>(".popup-header h1");
  if (headerTitle) headerTitle.textContent = translator.t("popup_title");

  const themeGroup = document.querySelector<HTMLElement>(".theme-toggle");
  if (themeGroup)
    themeGroup.setAttribute(
      "aria-label",
      translator.t("popup_theme_aria_label")
    );
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

  const settingsBtn = document.querySelector<HTMLButtonElement>(
    "#popup-tab-settings"
  );
  if (settingsBtn)
    settingsBtn.setAttribute(
      "aria-label",
      translator.t("popup_settings_aria_label")
    );
  const closeBtn = document.getElementById(
    "popup-btn-close"
  ) as HTMLButtonElement | null;
  if (closeBtn)
    closeBtn.setAttribute("aria-label", translator.t("popup_close_aria_label"));

  const statusText = document.getElementById(
    "popup-status-text"
  ) as HTMLElement | null;
  if (statusText) statusText.textContent = translator.t("popup_status_ready");

  const modelLabel = document.querySelector<HTMLElement>(".popup-model-label");
  if (modelLabel) modelLabel.textContent = translator.t("popup_model_label");

  const credentialsTitle = document.querySelector<HTMLElement>(
    ".popup-section-title"
  );
  if (credentialsTitle)
    credentialsTitle.textContent = translator.t("popup_credentials_title");

  const userLabel = document.querySelector<HTMLLabelElement>(
    'label[for="popup-input-username"]'
  );
  if (userLabel)
    userLabel.textContent = translator.t("popup_credentials_user_label");

  const passwordLabel = document.querySelector<HTMLLabelElement>(
    'label[for="popup-input-password"]'
  );
  if (passwordLabel)
    passwordLabel.textContent = translator.t(
      "popup_credentials_password_label"
    );

  const savedCredsTitle = document.querySelector<HTMLElement>(
    ".popup-saved-credentials-title"
  );
  if (savedCredsTitle)
    savedCredsTitle.textContent = translator.t("popup_saved_credentials_title");

  const collectBtn = document.getElementById(
    "popup-btn-collect"
  ) as HTMLButtonElement | null;
  if (collectBtn) collectBtn.textContent = translator.t("popup_collect_start");

  const clearBtn = document.getElementById(
    "popup-btn-clear"
  ) as HTMLButtonElement | null;
  if (clearBtn)
    clearBtn.setAttribute("aria-label", translator.t("popup_clear_aria_label"));

  // Generic text translations for labels using data-i18n
  const textNodes = document.querySelectorAll<HTMLElement>("[data-i18n]");
  textNodes.forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    el.textContent = translator.t(key);
  });

  // Generic ARIA label translations
  const ariaLabelNodes = document.querySelectorAll<HTMLElement>(
    "[data-i18n-aria-label]"
  );
  ariaLabelNodes.forEach((el) => {
    const key = el.dataset.i18nAriaLabel;
    if (!key) return;
    el.setAttribute("aria-label", translator.t(key));
  });

  const tabMain = document.getElementById(
    "popup-tab-main"
  ) as HTMLButtonElement | null;
  if (tabMain) tabMain.textContent = translator.t("popup_tab_main");
  const tabTopology = document.getElementById(
    "popup-tab-topology"
  ) as HTMLButtonElement | null;
  if (tabTopology) tabTopology.textContent = translator.t("popup_tab_topology");
  // const tabLogs = document.getElementById(
  //   "popup-tab-logs"
  // ) as HTMLButtonElement | null;
  // if (tabLogs) tabLogs.textContent = translator.t("popup_tab_logs");

  const sectionTitles = document.querySelectorAll<HTMLElement>(
    "#popup-section-wan .popup-section-title," +
      "#popup-section-remote-access .popup-section-title," +
      "#popup-section-wlan-band-steering .popup-section-title," +
      "#popup-section-wlan-24ghz .popup-section-title," +
      "#popup-section-wlan-5ghz .popup-section-title," +
      "#popup-section-dhcp .popup-section-title," +
      "#popup-section-upnp .popup-section-title," +
      "#popup-section-router-version .popup-section-title," +
      "#popup-section-tr069 .popup-section-title"
  );
  sectionTitles.forEach((el) => {
    const parentId = el.closest("section")?.id;
    switch (parentId) {
      case "popup-section-wan":
        el.textContent = translator.t("popup_section_wan");
        break;
      case "popup-section-remote-access":
        el.textContent = translator.t("popup_section_remote_access");
        break;
      case "popup-section-wlan-band-steering":
        el.textContent = translator.t("popup_section_band_steering");
        break;
      case "popup-section-wlan-24ghz":
        el.textContent = translator.t("popup_section_wlan_24");
        break;
      case "popup-section-wlan-5ghz":
        el.textContent = translator.t("popup_section_wlan_5");
        break;
      case "popup-section-dhcp":
        el.textContent = translator.t("popup_section_dhcp");
        break;
      case "popup-section-upnp":
        el.textContent = translator.t("popup_section_upnp");
        break;
      case "popup-section-router-version":
        el.textContent = translator.t("popup_section_router_version");
        break;
      case "popup-section-tr069":
        el.textContent = translator.t("popup_section_tr069");
        break;
      default:
        break;
    }
  });

  const topologyTitles = document.querySelectorAll<HTMLElement>(
    "#popup-section-topology-cable .popup-section-title," +
      "#popup-section-topology-24ghz .popup-section-title," +
      "#popup-section-topology-5ghz .popup-section-title"
  );
  topologyTitles.forEach((el) => {
    const parentId = el.closest("section")?.id;
    switch (parentId) {
      case "popup-section-topology-cable":
        el.textContent = translator.t("popup_topology_cable_devices");
        break;
      case "popup-section-topology-24ghz":
        el.textContent = translator.t("popup_topology_24_devices");
        break;
      case "popup-section-topology-5ghz":
        el.textContent = translator.t("popup_topology_5_devices");
        break;
      default:
        break;
    }
  });

  const noDataLabels = document.querySelectorAll<HTMLElement>(
    ".popup-topology-no-data"
  );
  noDataLabels.forEach((el) => {
    el.textContent = translator.t("popup_topology_no_data");
  });
}

function setupTabs(): void {
  const tabMain = document.getElementById("popup-tab-main");
  // const tabLogs = document.getElementById("popup-tab-logs");
  const tabTopology = document.getElementById("popup-tab-topology");
  const tabDiagnostics = document.getElementById("popup-tab-diagnostics");

  const panelMain = document.getElementById("popup-panel-main");
  // const panelLogs = document.getElementById("popup-panel-logs");
  const panelTopology = document.getElementById("popup-panel-topology");
  const panelDiagnostics = document.getElementById("popup-panel-diagnostics");

  if (
    !tabMain ||
    // !tabLogs ||
    !tabDiagnostics ||
    !panelMain ||
    // !panelLogs ||
    !panelDiagnostics ||
    !tabTopology ||
    !panelTopology
  )
    return;

  const activate = (target: tabElement): void => {
    const isMain = target === tabElement.MAIN;
    const isTopology = target === tabElement.TOPOLOGY;
    // const isLogs = target === tabElement.LOGS;
    const isDiagnostics = target === tabElement.DIAGNOSTICS;

    tabMain.classList.toggle("popup-tab--active", isMain);
    tabTopology.classList.toggle("popup-tab--active", isTopology);
    // tabLogs.classList.toggle("popup-tab--active", isLogs);
    tabDiagnostics.classList.toggle("popup-tab--active", isDiagnostics);

    tabMain.setAttribute("aria-selected", String(isMain));
    tabTopology.setAttribute("aria-selected", String(isTopology));
    // tabLogs.setAttribute("aria-selected", String(isLogs));
    tabDiagnostics.setAttribute("aria-selected", String(isDiagnostics));

    panelMain.classList.toggle("popup-hidden", !isMain);
    panelTopology.classList.toggle("popup-hidden", !isTopology);
    // panelLogs.classList.toggle("popup-hidden", !isLogs);
    panelDiagnostics.classList.toggle("popup-hidden", !isDiagnostics);
  };

  tabMain.addEventListener("click", () => activate(tabElement.MAIN));
  tabTopology.addEventListener("click", () => activate(tabElement.TOPOLOGY));
  // tabLogs.addEventListener("click", () => activate(tabElement.LOGS));
  tabDiagnostics.addEventListener("click", () =>
    activate(tabElement.DIAGNOSTICS)
  );
}

/** Section toggle/section id pairs; must match popup.html. */
const SECTION_IDS = [
  { toggleId: "popup-toggle-wan", sectionId: "popup-section-wan" },
  {
    toggleId: "popup-toggle-remote-access",
    sectionId: "popup-section-remote-access",
  },
  {
    toggleId: "popup-toggle-wlan-band-steering",
    sectionId: "popup-section-wlan-band-steering",
  },
  {
    toggleId: "popup-toggle-wlan-24ghz",
    sectionId: "popup-section-wlan-24ghz",
  },
  { toggleId: "popup-toggle-wlan-5ghz", sectionId: "popup-section-wlan-5ghz" },
  { toggleId: "popup-toggle-dhcp", sectionId: "popup-section-dhcp" },
  { toggleId: "popup-toggle-upnp", sectionId: "popup-section-upnp" },
  {
    toggleId: "popup-toggle-router-version",
    sectionId: "popup-section-router-version",
  },
  { toggleId: "popup-toggle-tr069", sectionId: "popup-section-tr069" },
  {
    toggleId: "popup-toggle-topology-cable",
    sectionId: "popup-section-topology-cable",
  },
  {
    toggleId: "popup-toggle-topology-24ghz",
    sectionId: "popup-section-topology-24ghz",
  },
  {
    toggleId: "popup-toggle-topology-5ghz",
    sectionId: "popup-section-topology-5ghz",
  },
] as const;

function setupSectionToggles(): void {
  for (const { toggleId, sectionId } of SECTION_IDS) {
    const toggle = document.getElementById(toggleId);
    const section = document.getElementById(sectionId);
    if (!toggle || !section) continue;

    toggle.addEventListener("click", () => {
      const isCollapsed = section.classList.toggle("collapsed");
      toggle.setAttribute("aria-expanded", String(!isCollapsed));
    });
  }
}

function setupSettingsButton(): void {
  const btn = document.querySelector<HTMLButtonElement>("#popup-tab-settings");
  if (!btn) return;
  btn.addEventListener("click", () => {
    void chrome.runtime.openOptionsPage();
  });
}

function setupCloseButton(): void {
  const btn = document.getElementById("popup-btn-close");
  if (!btn) return;
  btn.addEventListener("click", () => {
    window.parent.postMessage({ type: "router-isp-toolkit-close" }, "*");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyPopupTranslations();

  new ThemeManager();
  setupTabs();
  setupSectionToggles();
  setupSettingsButton();
  setupCloseButton();
  new PopupController();
});
