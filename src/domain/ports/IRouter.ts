import type {
  ButtonConfig,
  Credentials,
  ExtractionResult,
  PingTestResult,
} from '../schemas/validation';

/**
 * Port for router adapter: domain contract for authentication and data extraction.
 * Implementations live in infrastructure (driver-specific). Keeps domain independent of infra (DIP).
 */
export interface IRouter {
  readonly model: string;
  readonly usernameSelector: string;
  readonly passwordSelector: string;

  isLoginPage(): boolean;
  authenticate(credentials: Credentials): void;
  extract(): Promise<ExtractionResult>;
  buttonElementConfig(): ButtonConfig | null;
  isAuthenticated(): boolean;
  ping(ip: string): Promise<PingTestResult | null>;
}
