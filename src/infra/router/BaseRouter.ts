import { DomService } from "../dom/DomService.js";
import type {
  ButtonConfig,
  Credentials,
  ExtractionResult,
} from "../../domain/schemas/validation.js";
import type { IRouter } from "../../domain/ports/IRouter.js";

/**
 * Abstract base for router adapters: shared DOM waiting/click behavior.
 * Lives in infra because it depends on DomService; implements domain IRouter (DIP).
 */
export abstract class BaseRouter implements IRouter {
  private static readonly CLICK_SETTLE_MS = 150;
  private static readonly DEFAULT_WAIT_AFTER_CLICK_MS = 500;

  private readonly name: string;

  protected abstract readonly loginSelectors: {
    username: string;
    password: string;
  };

  protected constructor(name: string) {
    if (new.target === BaseRouter) {
      throw new Error(
        "BaseRouter is abstract and cannot be instantiated directly"
      );
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
    const selectors = [
      this.loginSelectors.username,
      this.loginSelectors.password,
    ];
    return selectors.every((selector) => {
      const element = document.querySelector(selector);
      return element instanceof HTMLElement;
    });
  }

  public abstract authenticate(credentials: Credentials): void;
  public abstract extract(): Promise<ExtractionResult>;
  public abstract buttonElementConfig(): ButtonConfig | null;
  public abstract isAuthenticated(): boolean;

  public waitForElement(
    selector: string,
    timeoutMs = 5000
  ): Promise<HTMLElement> {
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
        reject(
          new Error(
            `Timeout: Element "${selector}" not found after ${timeoutMs}ms`
          )
        );
      }, timeoutMs);
    });
  }

  protected async clickElementAndWait(
    sectionSelector: string,
    waitForSelector?: string,
    delayMs?: number
  ): Promise<void> {
    const section = DomService.getElement(sectionSelector, HTMLElement);
    DomService.safeClick(section);

    const targetSelector = waitForSelector ?? sectionSelector;
    const maxWaitMs = delayMs ?? BaseRouter.DEFAULT_WAIT_AFTER_CLICK_MS;

    await this.delay(BaseRouter.CLICK_SETTLE_MS);

    const elementPromise = this.waitForElement(targetSelector);
    const resolved = await Promise.race([
      elementPromise.then(() => true),
      this.delay(maxWaitMs).then(() => false),
    ]);

    if (!resolved) {
      await elementPromise;
    }
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
