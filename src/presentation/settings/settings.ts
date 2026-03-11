import { BOOKMARKS_STORAGE_KEY } from "../../application/constants/index.js";
import { StorageService } from "../../infra/storage/StorageService.js";
import { ThemeManager } from "../popup/ThemeManager.js";

import type { BookmarkStore } from "../popup/index.js";

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

  const store =
    (await StorageService.get<BookmarkStore>(BOOKMARKS_STORAGE_KEY)) ?? {};
  const entries = Object.entries(store).filter(
    ([, entry]) => entry.credentials.length > 0
  );
  const total = entries.reduce(
    (sum, [, entry]) => sum + entry.credentials.length,
    0
  );

  if (countEl) countEl.textContent = String(total);

  if (!listEl) return;

  if (total === 0) {
    const div = document.createElement("div");
    div.className = "settings-bookmarks-empty";
    div.textContent = "No saved credentials yet.";
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
      deleteButton.title = "Remove credential";
      deleteButton.type = "button";
      deleteButton.ariaLabel = `Remove credential for ${escapeHtml(username)}`;
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
  const store =
    (await StorageService.get<BookmarkStore>(BOOKMARKS_STORAGE_KEY)) ?? {};
  const entry = store[modelKey];
  if (!entry) return;

  entry.credentials.splice(credIdx, 1);
  if (entry.credentials.length === 0) delete store[modelKey];

  await StorageService.save(BOOKMARKS_STORAGE_KEY, store);
  await loadBookmarks();
  showToast("Credential removed", "ok");
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
    showToast("All extension data cleared", "ok");
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
  setupVersion();
  setupAccordion();
  setupBookmarksList();
  setupClearAll();
  void loadBookmarks();
});
