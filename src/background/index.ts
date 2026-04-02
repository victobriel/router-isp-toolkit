import { LAST_DATA_STORAGE_KEY, ROUTER_MODEL_STORAGE_KEY } from '@/application/constants';
import { ExtractionResultSchema, type ExtractionResult } from '@/domain/schemas/validation';
import type { CollectResponse } from '@/application/types';
import { services } from '@/index';

const { tabMessenger, sessionStorage } = services;

// Content scripts need this so they share `chrome.storage.session` with the popup; session is
// trusted-only by default (see SessionStorageService).
try {
  const area = chrome.storage?.session;
  if (area && typeof area.setAccessLevel === 'function') {
    void area.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
  }
} catch {
  // ignore
}

class ExtensionManager {
  public static async saveLastExtractionData(
    tabId: number | undefined,
    data: unknown,
  ): Promise<CollectResponse> {
    if (tabId === undefined || tabId === chrome.tabs.TAB_ID_NONE) {
      return {
        success: false,
        message: 'No tab id available for extraction data',
      };
    }

    const parsed = ExtractionResultSchema.safeParse({
      ...(typeof data === 'object' && data !== null ? data : {}),
      timestamp: new Date().toISOString(),
    });

    if (!parsed.success) {
      return {
        success: false,
        message: JSON.stringify(parsed.error.issues ?? []),
      };
    }

    const storageKey = `${LAST_DATA_STORAGE_KEY}:${String(tabId)}`;
    const value: ExtractionResult = parsed.data;
    await sessionStorage.save(storageKey, value, 24 * 60 * 1000);

    return { success: true, data: value };
  }

  public static async saveDetectedRouterModel(
    tabId: number | undefined,
    model: string,
  ): Promise<CollectResponse> {
    if (tabId === undefined || tabId === chrome.tabs.TAB_ID_NONE) {
      return {
        success: false,
        message: 'No tab id available for detected router model',
      };
    }

    const storageKey = `${ROUTER_MODEL_STORAGE_KEY}:${String(tabId)}`;
    await sessionStorage.save(storageKey, model);

    return { success: true };
  }

  public static async showOverlay(tabId: number): Promise<CollectResponse> {
    try {
      await tabMessenger.sendToTab(tabId, { action: 'showOverlay' });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message };
    }
  }

  public static async copyToClipboard(text: unknown): Promise<CollectResponse> {
    if (typeof text !== 'string' || text.length === 0) {
      return {
        success: false,
        message: 'No text available to copy',
      };
    }

    try {
      await navigator.clipboard.writeText(text);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message };
    }
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  void tabMessenger.sendToTab(tab.id, { action: 'toggleOverlay' }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const actions: Record<string, () => boolean> = {
    openPopup: () => {
      const tabId = sender.tab?.id;
      if (tabId === undefined) {
        sendResponse({ success: false, message: 'No tab available' });
        return false;
      }
      void ExtensionManager.showOverlay(tabId)
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      return true;
    },

    saveDetectedRouterModel: () => {
      void ExtensionManager.saveDetectedRouterModel(sender.tab?.id, message.model)
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
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
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      return true;
    },

    copyToClipboard: () => {
      void ExtensionManager.copyToClipboard(message.text)
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      return true;
    },
  };

  const handler = message.action as string;
  if (handler in actions) {
    return actions[handler]?.();
  }

  return false;
});
