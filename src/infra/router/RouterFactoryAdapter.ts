import type { IRouterFactory } from '@/application/ports/IRouterFactory';

import { RouterFactory } from './RouterFactory';

/**
 * Thin adapter to expose the infra router factory behind an application port.
 */
export class RouterFactoryAdapter implements IRouterFactory {
  public create() {
    return RouterFactory.create();
  }
}
