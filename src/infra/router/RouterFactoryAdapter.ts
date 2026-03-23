import { IDomGateway } from '@/application/ports/IDomGateway';
import type { IRouterFactory } from '@/application/ports/IRouterFactory';
import type { IRouter } from '@/domain/ports/IRouter';

import { RouterFactory } from '@/infra/router/RouterFactory';

/**
 * Thin adapter to expose the infra router factory behind an application port.
 */
export class RouterFactoryAdapter implements IRouterFactory {
  private readonly routerFactory: RouterFactory;

  constructor(domService: IDomGateway) {
    this.routerFactory = new RouterFactory(domService);
  }

  public create(): IRouter {
    return this.routerFactory.create();
  }
}
