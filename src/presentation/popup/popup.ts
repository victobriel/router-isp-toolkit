import { PopupController } from "./PopupController.js";

enum tabElement {
  MAIN = "main",
  LOGS = "logs",
  TOPOLOGY = "topology",
}

function setupTabs(): void {
  const tabMain = document.getElementById("popup-tab-main");
  const tabLogs = document.getElementById("popup-tab-logs");
  const tabTopology = document.getElementById("popup-tab-topology");

  const panelMain = document.getElementById("popup-panel-main");
  const panelLogs = document.getElementById("popup-panel-logs");
  const panelTopology = document.getElementById("popup-panel-topology");

  if (
    !tabMain ||
    !tabLogs ||
    !panelMain ||
    !panelLogs ||
    !tabTopology ||
    !panelTopology
  )
    return;

  const activate = (target: tabElement): void => {
    const isMain = target === tabElement.MAIN;
    const isLogs = target === tabElement.LOGS;
    const isTopology = target === tabElement.TOPOLOGY;

    tabMain.classList.toggle("popup-tab--active", isMain);
    tabLogs.classList.toggle("popup-tab--active", isLogs);
    tabTopology.classList.toggle("popup-tab--active", isTopology);

    tabMain.setAttribute("aria-selected", String(isMain));
    tabLogs.setAttribute("aria-selected", String(isLogs));
    tabTopology.setAttribute("aria-selected", String(isTopology));

    panelMain.classList.toggle("popup-hidden", !isMain);
    panelLogs.classList.toggle("popup-hidden", !isLogs);
    panelTopology.classList.toggle("popup-hidden", !isTopology);
  };

  tabMain.addEventListener("click", () => activate(tabElement.MAIN));
  tabLogs.addEventListener("click", () => activate(tabElement.LOGS));
  tabTopology.addEventListener("click", () => activate(tabElement.TOPOLOGY));
}

function setupSectionToggles(): void {
  const toggleWanSection = document.getElementById("popup-toggle-wan");
  const wanSection = document.getElementById("popup-section-wan");

  const toggleRemoteAccessSection = document.getElementById(
    "popup-toggle-remote-access"
  );
  const remoteAccessSection = document.getElementById("popup-section-remote-access");

  if (
    !toggleWanSection ||
    !wanSection ||
    !toggleRemoteAccessSection ||
    !remoteAccessSection
  )
    return;

  toggleWanSection.addEventListener("click", () => {
    const isCollapsed = wanSection.classList.toggle("collapsed");
    toggleWanSection.setAttribute("aria-expanded", String(!isCollapsed));
  });

  toggleRemoteAccessSection.addEventListener("click", () => {
    const isCollapsed = remoteAccessSection.classList.toggle("collapsed");
    toggleRemoteAccessSection.setAttribute(
      "aria-expanded",
      String(!isCollapsed)
    );
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupSectionToggles();
  new PopupController();
});
