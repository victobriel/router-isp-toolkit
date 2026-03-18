import { DomService } from '../infra/dom/DomService';
import { RouterFactory } from '../infra/router/RouterFactory';
import { StorageService } from '../infra/storage/StorageService';

import { BOOKMARKS_STORAGE_KEY, PENDING_AUTH_ERROR_STORAGE_KEY } from './constants/index';

import type { BookmarkStore } from './types/index';
import type { Router } from '../domain/models/Router';
import { CollectMessageAction, type ButtonConfig } from '../domain/schemas/validation';
import { CollectionService } from './CollectionService';

/**
 * Application use case: bootstrap content script on router page.
 * Detects router, persists model, handles post-login redirect, injects UI.
 */
export class ContentPageUseCase {
  public static async bootstrap(): Promise<void> {
    let router: Router;
    try {
      router = RouterFactory.create();
    } catch {
      return;
    }

    const result = await chrome.runtime.sendMessage({
      action: 'saveDetectedRouterModel',
      model: router.model,
    });

    if (!result?.success) {
      console.error('Failed to save detected router model', result?.message);
    }

    const loginPending = sessionStorage.getItem('router_login_pending');
    const loginTimeStr = sessionStorage.getItem('router_login_time');

    if (loginPending === 'true' && loginTimeStr !== null) {
      await this.handlePostLoginRedirect(router, parseInt(loginTimeStr, 10));
    }

    this.injectUIComponents(router);
    this.fillLoginFields(router);
  }

  private static async handlePostLoginRedirect(router: Router, loginTime: number): Promise<void> {
    sessionStorage.removeItem('router_login_pending');
    sessionStorage.removeItem('router_login_time');

    if (!router.isAuthenticated()) {
      const storageKey = PENDING_AUTH_ERROR_STORAGE_KEY;
      await StorageService.save(
        storageKey,
        'Authentication failed. Please verify your username and password and try again',
        5 * 60 * 1000,
      );
      void chrome.runtime.sendMessage({ action: 'openPopup' });
      return;
    }

    const elapsed = Date.now() - loginTime;
    // 10 seconds is the maximum time allowed for authentication
    if (elapsed < 10 * 1000) {
      const result = await CollectionService.handleCollect({
        action: CollectMessageAction.COLLECT,
      });

      if (result.success && result.data) {
        await chrome.runtime.sendMessage({
          action: 'saveLastExtractionData',
          data: result.data,
        });
        void chrome.runtime.sendMessage({ action: 'openPopup' });
      }
    }
  }

  private static injectUIComponents(router: Router): void {
    const btnElementConfig = router.buttonElementConfig();

    if (btnElementConfig === null || !router.isLoginPage()) {
      return;
    }

    const dataBtnParentElement = DomService.getElement(
      btnElementConfig.targetSelector,
      HTMLElement,
    );
    dataBtnParentElement.style.position = 'relative';

    try {
      const btn = this.createGetDataBtn(router, btnElementConfig);
      dataBtnParentElement.appendChild(btn);
    } catch (error) {
      console.warn('UI Injection failed:', error);
    }
  }

  private static createGetDataBtn(
    router: Router,
    btnElementConfig: ButtonConfig,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'routerCollectDataBtn';
    btn.textContent = btnElementConfig.text;
    btn.style.cssText = btnElementConfig.style;

    btn.addEventListener('click', async () => {
      const username = DomService.getValueElement(router.usernameSelector).value.trim();
      const password = DomService.getValueElement(router.passwordSelector).value;

      if (username === '' || password === '') {
        alert('Please enter credentials in the router login fields first');
        return;
      }

      const result = await CollectionService.handleCollect({
        action: CollectMessageAction.AUTHENTICATE,
        credentials: { username, password },
      });

      if (result.success) {
        void chrome.runtime.sendMessage({ action: 'openPopup' });
      }
    });
    return btn;
  }

  private static async fillLoginFields(router: Router): Promise<void> {
    if (!router.isLoginPage()) {
      return;
    }

    const usernameElement = DomService.getValueElement(router.usernameSelector);
    const passwordElement = DomService.getValueElement(router.passwordSelector);

    if (!usernameElement || !passwordElement) {
      console.warn('Failed to find username or password element');
      return;
    }

    const store = (await StorageService.get<BookmarkStore>(BOOKMARKS_STORAGE_KEY)) ?? {};

    const modelEntry = store[router.model];

    if (!modelEntry?.credentials || modelEntry.credentials.length === 0) {
      return;
    }

    const firstBookmark = modelEntry.credentials[0];
    if (firstBookmark) {
      DomService.updateField(usernameElement, firstBookmark.username);
      DomService.updateField(passwordElement, firstBookmark.password);
    }
  }

  public static fillLoginFieldsWithCredentials(username: string, password: string): void {
    let router: Router;
    try {
      router = RouterFactory.create();
    } catch {
      return;
    }

    if (!router.isLoginPage()) {
      return;
    }

    try {
      const usernameElement = DomService.getValueElement(router.usernameSelector);
      const passwordElement = DomService.getValueElement(router.passwordSelector);
      DomService.updateField(usernameElement, username);
      DomService.updateField(passwordElement, password);
    } catch {
      console.warn('Failed to fill login fields from popup selection');
    }
  }
}
