import type { IRouter } from '@/domain/ports/IRouter';

/**
 * Port for router creation/detection. Implementations live in infrastructure.
 */
export interface IRouterFactory {
  create(): IRouter;
}
