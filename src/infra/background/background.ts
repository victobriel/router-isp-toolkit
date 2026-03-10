import { StorageService } from "../storage/StorageService.js";
import type { CollectResponse } from "../../application/types/index.js";
import {
  LAST_DATA_STORAGE_KEY,
  ROUTER_MODEL_STORAGE_KEY,
} from "../../application/constants/index.js";

class ExtensionManager {
  public static async saveLastExtractionData(
    tabId: number | undefined,
    data: unknown
  ): Promise<CollectResponse> {
    if (tabId === undefined || tabId === chrome.tabs.TAB_ID_NONE) {
      return {
        success: false,
        message: "No tab id available for extraction data",
      };
    }

    if (typeof data !== "object" || data === null) {
      return { success: false, message: "Invalid extraction data" };
    }

    const storageKey = `${LAST_DATA_STORAGE_KEY}-${tabId}`;
    await StorageService.save(storageKey, data, 24 * 60 * 1000);

    return { success: true };
  }

  public static async saveDetectedRouterModel(
    tabId: number | undefined,
    model: unknown
  ): Promise<CollectResponse> {
    if (tabId === undefined || tabId === chrome.tabs.TAB_ID_NONE) {
      return {
        success: false,
        message: "No tab id available for detected router model",
      };
    }

    if (typeof model !== "string" || model.trim() === "") {
      return { success: false, message: "Invalid router model" };
    }

    const storageKey = `${ROUTER_MODEL_STORAGE_KEY}-${tabId}`;
    await StorageService.save(storageKey, model);

    return { success: true };
  }

  public static async showOverlay(tabId: number): Promise<CollectResponse> {
    try {
      await chrome.tabs.sendMessage(tabId, { action: "showOverlay" });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, message };
    }
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  void chrome.tabs
    .sendMessage(tab.id, { action: "toggleOverlay" })
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const actions = {
    openPopup: () => {
      const tabId = sender.tab?.id;
      if (tabId === undefined) {
        sendResponse({ success: false, message: "No tab available" });
        return false;
      }
      void ExtensionManager.showOverlay(tabId)
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        });
      return true;
    },

    saveDetectedRouterModel: () => {
      void ExtensionManager.saveDetectedRouterModel(
        sender.tab?.id,
        message.model
      )
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        });
      return true;
    },

    saveLastExtractionData: () => {
      void ExtensionManager.saveLastExtractionData(sender.tab?.id, message.data)
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        });
      return true;
    },
  };

  const handler = message.action;
  if (handler in actions) {
    return actions[handler as keyof typeof actions]();
  }

  return false; // No handler for this action
});
