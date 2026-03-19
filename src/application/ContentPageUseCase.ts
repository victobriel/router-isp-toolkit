import type { IStorage } from './ports/IStorage';
import type { IRouterFactory } from './ports/IRouterFactory';
import type { IDomGateway } from './ports/IDomGateway';

import { BOOKMARKS_STORAGE_KEY, PENDING_AUTH_ERROR_STORAGE_KEY } from './constants/index';

import type { BookmarkStore } from './types/index';
import type { IRouter as Router } from '../domain/ports/IRouter';
import { CollectMessageAction, type ButtonConfig } from '../domain/schemas/validation';
import { CollectionService } from './CollectionService';

/**
 * Application use case: bootstrap content script on router page.
 * Detects router, persists model, handles post-login redirect, injects UI.
 */
export class ContentPageUseCase {
  constructor(
    private readonly routerFactory: IRouterFactory,
    private readonly storage: IStorage,
    private readonly sessionStorage: IStorage,
    private readonly dom: IDomGateway,
    private readonly collectionService: CollectionService,
  ) {}

  public async bootstrap(): Promise<void> {
    let router: Router;
    try {
      router = this.routerFactory.create();
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

    const loginPendingRaw = await this.sessionStorage.get<unknown>('router_login_pending');
    const loginTimeRaw = await this.sessionStorage.get<unknown>('router_login_time');

    const loginPendingIsTrue = loginPendingRaw === 'true' || loginPendingRaw === true;
    const loginTime =
      typeof loginTimeRaw === 'number'
        ? loginTimeRaw
        : typeof loginTimeRaw === 'string'
          ? parseInt(loginTimeRaw, 10)
          : NaN;

    if (loginPendingIsTrue && Number.isFinite(loginTime)) {
      await this.handlePostLoginRedirect(router, loginTime);
    }

    this.injectUIComponents(router);
    await this.fillLoginFields(router);
  }

  private async handlePostLoginRedirect(router: Router, loginTime: number): Promise<void> {
    await this.sessionStorage.remove('router_login_pending');
    await this.sessionStorage.remove('router_login_time');

    if (!router.isAuthenticated()) {
      const storageKey = PENDING_AUTH_ERROR_STORAGE_KEY;
      await this.storage.save(
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
      const result = await this.collectionService.handleCollect({
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

  private injectUIComponents(router: Router): void {
    const btnElementConfig = router.buttonElementConfig();

    if (btnElementConfig === null || !router.isLoginPage()) {
      return;
    }

    const dataBtnParentElement = this.dom.getElement(btnElementConfig.targetSelector, HTMLElement);
    dataBtnParentElement.style.position = 'relative';

    try {
      const btn = this.createGetDataBtn(router, btnElementConfig);
      dataBtnParentElement.appendChild(btn);
    } catch (error) {
      console.warn('UI Injection failed:', error);
    }
  }

  private createGetDataBtn(router: Router, btnElementConfig: ButtonConfig): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'routerCollectDataBtn';
    btn.textContent = btnElementConfig.text;
    btn.style.cssText = btnElementConfig.style;

    btn.addEventListener('click', async () => {
      const credentials = router.readLoginCredentials();
      if (!credentials || credentials.username === '' || credentials.password === '') {
        alert('Please enter credentials in the router login fields first');
        return;
      }

      const result = await this.collectionService.handleCollect({
        action: CollectMessageAction.AUTHENTICATE,
        credentials,
      });

      if (result.success) {
        void chrome.runtime.sendMessage({ action: 'openPopup' });
      }
    });
    return btn;
  }

  private async fillLoginFields(router: Router): Promise<void> {
    if (!router.isLoginPage()) {
      return;
    }

    const store = (await this.storage.get<BookmarkStore>(BOOKMARKS_STORAGE_KEY)) ?? {};

    const modelEntry = store[router.model];

    if (!modelEntry?.credentials || modelEntry.credentials.length === 0) {
      return;
    }

    const firstBookmark = modelEntry.credentials[0];
    if (firstBookmark) {
      router.fillLoginCredentials({
        username: firstBookmark.username,
        password: firstBookmark.password,
      });
    }
  }

  public fillLoginFieldsWithCredentials(username: string, password: string): void {
    let router: Router;
    try {
      router = this.routerFactory.create();
    } catch {
      return;
    }

    if (!router.isLoginPage()) {
      return;
    }

    try {
      router.fillLoginCredentials({ username, password });
    } catch {
      console.warn('Failed to fill login fields from popup selection');
    }
  }
}
