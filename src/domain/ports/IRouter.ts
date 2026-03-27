import type { Credentials, ExtractionResult, PingTestResult } from '@/domain/schemas/validation';
import type { ButtonConfig } from './IRouter.types';
import { ExtractionFilter, GoToPageOptions, RouterPage, RouterPageKey } from '@/application/types';

/**
 * Port for router adapter: domain contract for authentication and data extraction.
 * Implementations live in infrastructure (driver-specific). Keeps domain independent of infra (DIP).
 */

export interface IRouter {
  readonly model: string;

  isLoginPage(): boolean;
  authenticate(credentials: Credentials): void;

  /**
   * Reads the current values from the router's login form.
   * Returns `null` if required inputs can't be found.
   */
  readLoginCredentials(): Credentials | null;

  /**
   * Fills the router's login form inputs without submitting.
   */
  fillLoginCredentials(credentials: Credentials): void;

  extract(filter?: ExtractionFilter): Promise<ExtractionResult>;
  buttonElementConfig(): ButtonConfig | null;
  isAuthenticated(): boolean;
  ping(ip: string): Promise<PingTestResult | null>;
  goToPage(page: RouterPage, key: RouterPageKey, options?: GoToPageOptions): void;
  reboot(): Promise<void>;
}
