import type { IDomGateway } from '@/application/ports/IDomGateway';
import type { IRouterFactory } from '@/application/ports/IRouterFactory';
import type { IStorage } from '@/application/ports/IStorage';

import {
  BOOKMARKS_STORAGE_KEY,
  LAST_AUTH_CREDENTIALS_STORAGE_KEY,
  PENDING_AUTH_ERROR_STORAGE_KEY,
} from '@/application/constants/index';

import { CollectionService } from '@/application/CollectionService';
import type { BookmarkStore } from '@/application/types/index';
import type { IRouter as Router } from '@/domain/ports/IRouter';
import { ButtonConfig } from '@/domain/ports/IRouter.types';
import { CollectMessageAction } from '@/domain/schemas/validation';
import { translator } from '@/infra/i18n/I18nService';

/**
 * Application use case: bootstrap content script on router page.
 * Detects router, persists model, handles post-login redirect, injects UI.
 */
export class ContentPageUseCase {
  constructor(
    private readonly routerFactory: IRouterFactory,
    private readonly storage: IStorage,
    private readonly sessionStorage: IStorage,
    private readonly domService: IDomGateway,
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

    const loginPendingRaw = await this.sessionStorage.get<boolean | string>('router_login_pending');
    const loginTimeRaw = await this.sessionStorage.get<number>('router_login_time');

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

    router.attachPendingNativeLoginCapture((credentials) => {
      void this.sessionStorage.save(LAST_AUTH_CREDENTIALS_STORAGE_KEY, credentials);
    });
  }

  private async handlePostLoginRedirect(router: Router, loginTime: number): Promise<void> {
    await this.sessionStorage.remove('router_login_pending');
    await this.sessionStorage.remove('router_login_time');

    if (!router.isAuthenticated()) {
      const storageKey = PENDING_AUTH_ERROR_STORAGE_KEY;
      await this.sessionStorage.save(
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

    const dataBtnParentElement = this.domService.getHTMLElement<HTMLElement>(
      btnElementConfig.targetSelector,
      HTMLElement,
    );
    if (!dataBtnParentElement) return;

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
    const logoSpan = document.createElement('span');
    logoSpan.style.cssText = btnElementConfig.extLogoStyle;
    logoSpan.textContent = translator.t('extName');
    btn.id = 'routerCollectDataBtn';
    btn.innerHTML = `<span style="text-decoration:underline;">${btnElementConfig.text}</span>`;
    btn.style.cssText = btnElementConfig.style;
    btn.appendChild(logoSpan);

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
