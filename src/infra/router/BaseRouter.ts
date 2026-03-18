import { DomService } from '../dom/DomService';
import type {
  ButtonConfig,
  Credentials,
  ExtractionResult,
  PingTestResult,
} from '../../domain/schemas/validation';
import type { IRouter } from '../../domain/ports/IRouter';
import {
  DEFAULT_MAX_WAIT_AFTER_CLICK_MS,
  DEFAULT_MAX_WAIT_AFTER_DISAPPEARANCE_MS,
} from '../../infra/drivers/shared/constants';

/**
 * Abstract base for router adapters: shared DOM waiting/click behavior.
 * Lives in infra because it depends on DomService; implements domain IRouter (DIP).
 */
export abstract class BaseRouter implements IRouter {
  private static readonly CLICK_SETTLE_MS = 150;

  private readonly name: string;

  protected abstract readonly loginSelectors: {
    username: string;
    password: string;
  };

  protected constructor(name: string) {
    if (new.target === BaseRouter) {
      throw new Error('BaseRouter is abstract and cannot be instantiated directly');
    }
    this.name = name;
  }

  public get model(): string {
    return this.name;
  }

  public get usernameSelector(): string {
    return this.loginSelectors.username;
  }

  public get passwordSelector(): string {
    return this.loginSelectors.password;
  }

  public isLoginPage(): boolean {
    const selectors = [this.loginSelectors.username, this.loginSelectors.password];
    return selectors.every((selector) => {
      const element = document.querySelector(selector);
      return element instanceof HTMLElement;
    });
  }

  public abstract authenticate(credentials: Credentials): void;
  public abstract extract(): Promise<ExtractionResult>;
  public abstract buttonElementConfig(): ButtonConfig | null;
  public abstract isAuthenticated(): boolean;
  public abstract ping(ip: string): Promise<PingTestResult | null>;

  public waitForElement(selector: string, timeoutMs = 5000): Promise<HTMLElement> {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element instanceof HTMLElement) {
        return resolve(element);
      }

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found instanceof HTMLElement) {
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout: Element "${selector}" not found after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  protected async clickElementAndWait(
    sectionSelector: string,
    waitForSelector?: string,
    maxWaitMs: number = DEFAULT_MAX_WAIT_AFTER_CLICK_MS,
  ): Promise<void> {
    const section = DomService.getElement(sectionSelector, HTMLElement);
    DomService.safeClick(section);

    const targetSelector = waitForSelector ?? sectionSelector;

    await this.delay(BaseRouter.CLICK_SETTLE_MS);

    try {
      await this.waitForElement(targetSelector, maxWaitMs);
    } catch {
      throw new Error(
        `Timeout: Element "${targetSelector}" did not appear after ${maxWaitMs}ms (router may be slow or overloaded)`,
      );
    }
  }

  protected async waitForDisappearance(
    selector: string,
    maxWaitMs: number = DEFAULT_MAX_WAIT_AFTER_DISAPPEARANCE_MS,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const hasDisappeared = (): boolean => {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) return true;
        const style = window.getComputedStyle(el);
        return style.display === 'none' || style.visibility === 'hidden';
      };

      if (hasDisappeared()) {
        resolve();
        return;
      }

      const observer = new MutationObserver(() => {
        if (hasDisappeared()) {
          observer.disconnect();
          resolve();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout: Element "${selector}" not disappeared after ${maxWaitMs}ms`));
      }, maxWaitMs);
    });
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
