import {
  PingTestResultSchema,
  type Credentials,
  type ExtractionResult,
  type PingTestResult,
} from '@/domain/schemas/validation';
import type { IRouter } from '@/domain/ports/IRouter';
import {
  DEFAULT_MAX_WAIT_AFTER_CLICK_MS,
  DEFAULT_MAX_WAIT_AFTER_DISAPPEARANCE_MS,
  DEFAULT_MAX_WAIT_AFTER_ELEMENT_MS,
  DEFAULT_MAX_WAIT_AFTER_INPUT_POPULATED_MS,
} from '@/infra/drivers/shared/constants';
import { IDomGateway } from '@/application/ports/IDomGateway';
import { ButtonConfig } from '@/domain/ports/IRouter.types';
import { ExtractionFilter, RouterPage, RouterPageKey, RouterSelectors } from '@/application/types';

/**
 * Abstract base for router adapters: shared DOM waiting/click behavior.
 * Lives in infra because it depends on DomService; implements domain IRouter (DIP).
 */
export abstract class BaseRouter implements IRouter {
  private static readonly CLICK_SETTLE_MS = 200;

  private readonly name: string;
  protected readonly domService: IDomGateway;
  protected readonly s: RouterSelectors;

  protected constructor(name: string, domService: IDomGateway, selectors: RouterSelectors) {
    if (new.target === BaseRouter) {
      throw new Error('BaseRouter is abstract and cannot be instantiated directly');
    }
    this.name = name;
    this.domService = domService;
    this.s = selectors;
  }

  public abstract authenticate(credentials: Credentials): void;
  public abstract extract(filter?: ExtractionFilter): Promise<ExtractionResult>;
  public abstract buttonElementConfig(): ButtonConfig | null;
  public abstract isAuthenticated(): boolean;
  public abstract ping(ip: string): Promise<PingTestResult | null>;
  public abstract goToPage(page: RouterPage, key: RouterPageKey): void;
  public abstract reboot(): Promise<void>;

  public get model(): string {
    return this.name;
  }

  public isLoginPage(): boolean {
    const selectors = [this.s.username, this.s.password];
    return selectors.every((selector) => {
      const element = document.querySelector(selector);
      return element instanceof HTMLElement;
    });
  }

  public readLoginCredentials(): Credentials | null {
    const usernameEl = this.domService.getHTMLElement(this.s.username, HTMLInputElement);
    const passwordEl = this.domService.getHTMLElement(this.s.password, HTMLInputElement);

    if (!usernameEl || !passwordEl) return null;

    return {
      username: usernameEl.value,
      password: passwordEl.value,
    };
  }

  public fillLoginCredentials(credentials: Credentials): void {
    const { username, password } = credentials;

    this.domService.updateHTMLElementValue(this.s.username, username);
    this.domService.updateHTMLElementValue(this.s.password, password);
  }

  public attachPendingNativeLoginCapture(onSubmit: (credentials: Credentials) => void): void {
    if (!this.isLoginPage()) return;

    const handler = (): void => {
      const creds = this.readLoginCredentials();
      if (creds) onSubmit(creds);
    };

    const usernameEl = this.domService.getHTMLElement(this.s.username, HTMLInputElement);
    const form = usernameEl?.closest('form');
    if (form) {
      form.addEventListener('submit', handler, { capture: true });
      return;
    }

    const submitEl = document.querySelector(this.s.submit);
    if (submitEl instanceof HTMLElement) {
      submitEl.addEventListener('click', handler, { capture: true });
    }
  }

  public waitForElement(
    selector: string,
    timeoutMs = DEFAULT_MAX_WAIT_AFTER_ELEMENT_MS,
  ): Promise<HTMLElement> {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el instanceof HTMLElement) {
        return resolve(el);
      }

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el instanceof HTMLElement) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout: Element "${selector}" not found after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Polls until an input's value is non-empty and not a loading placeholder ("...").
   * Necessary when the router populates input fields asynchronously after the
   * containing section is already in the DOM.
   */
  protected waitForInputPopulated(
    selector: string,
    timeoutMs = DEFAULT_MAX_WAIT_AFTER_INPUT_POPULATED_MS,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const isPopulated = (): boolean => {
        const el = document.querySelector<HTMLInputElement>(selector);
        const value = el?.value?.trim() ?? '';
        return value.length > 0 && value !== '';
      };

      if (isPopulated()) {
        resolve();
        return;
      }

      const interval = setInterval(() => {
        if (isPopulated()) {
          clearInterval(interval);
          resolve();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(interval);
        reject(new Error(`Timeout: Input "${selector}" not populated after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  protected async clickElementAndWait(
    sectionSelector: string,
    waitForSelector?: string,
    maxWaitMs: number = DEFAULT_MAX_WAIT_AFTER_CLICK_MS,
  ): Promise<void> {
    this.domService.safeClick(sectionSelector);

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

  /**
   * Parses the raw ping test result into a PingTestResult object.
   * @param raw - The raw ping test result.
   * @param ip - The IP address being pinged.
   * @returns The parsed PingTestResult object.
   */
  protected parsePingTestResult(raw: string, ip: string): PingTestResult | null {
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    let bytes = undefined;
    const headerLine = lines.find((line) => line.startsWith('PING '));
    if (headerLine) {
      const headerMatch = headerLine.match(/PING\s+.*\(([^)]+)\):\s+(\d+)\s+data bytes/i);
      if (headerMatch) {
        bytes = Number(headerMatch[2]);
      }
    }

    const replyLines = lines.filter((line) => line.toLowerCase().startsWith('reply from'));

    const times: number[] = [];
    const sequences: number[] = [];
    let ttl = undefined;

    if (replyLines.length > 0) {
      replyLines.forEach((reply) => {
        const replyMatch = reply.match(/bytes=(\d+)\s+ttl=(\d+)\s+time=([\d.]+)ms\s+seq=(\d+)/i);
        if (replyMatch) {
          bytes = Number(replyMatch[1]);
          ttl = Number(replyMatch[2]);
          times.push(Number(replyMatch[3]));
          sequences.push(Number(replyMatch[4]));
        }
      });
    }

    const statsLine = lines.find((line) => line.toLowerCase().includes('packets transmitted'));
    const rttLine = lines.find((line) => line.toLowerCase().includes('min/avg/max'));

    const statsMatch =
      statsLine &&
      statsLine.match(
        /(\d+)\s+packets transmitted,\s+(\d+)\s+packets received,\s+(\d+)% packet loss/i,
      );
    const rttMatch = rttLine && rttLine.match(/min\/avg\/max\s*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/i);

    const transmitted = statsMatch ? Number(statsMatch[1]) : undefined;
    const received = statsMatch ? Number(statsMatch[2]) : undefined;
    const loss = statsMatch ? Number(statsMatch[3]) : undefined;
    const min = rttMatch ? Number(rttMatch[1]) : undefined;
    const avg = rttMatch ? Number(rttMatch[2]) : undefined;
    const max = rttMatch ? Number(rttMatch[3]) : undefined;

    const base = {
      ip,
      bytes,
      time: times.length > 0 ? times : undefined,
      sequence: sequences.length > 0 ? sequences : undefined,
      ttl,
      packets: {
        transmitted,
        received,
        loss,
        min,
        avg,
        max,
      },
      message: raw,
    };

    return PingTestResultSchema.parse(base);
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected async stepByStepNavigate(steps: string[]): Promise<void> {
    for (const step of steps) {
      if (!step) continue;
      const nextStep = steps[steps.indexOf(step) + 1];
      await this.clickElementAndWait(step, nextStep);
    }
  }
}
