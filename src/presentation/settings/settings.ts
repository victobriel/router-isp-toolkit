import { ThemeManager } from "../popup/ThemeManager.js";
import { StorageService } from "../../infra/storage/StorageService.js";
import { BOOKMARKS_STORAGE_KEY } from "../../application/constants/index.js";
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

async function loadBookmarkCount(): Promise<void> {
  const el = document.getElementById("settings-bookmark-count");
  if (!el) return;

  const store =
    (await StorageService.get<BookmarkStore>(BOOKMARKS_STORAGE_KEY)) ?? {};
  const total = Object.values(store).reduce(
    (sum, entry) => sum + entry.credentials.length,
    0
  );
  el.textContent = String(total);
}

function setupClearAll(): void {
  const btn = document.getElementById("settings-btn-clear-all");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    await StorageService.clear();
    await loadBookmarkCount();
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
  setupClearAll();
  void loadBookmarkCount();
});
