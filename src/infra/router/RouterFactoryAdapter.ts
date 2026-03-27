import { IDomGateway } from '@/application/ports/IDomGateway';
import type { IRouterFactory } from '@/application/ports/IRouterFactory';
import type { IRouter } from '@/domain/ports/IRouter';

import { RouterFactory } from '@/infra/router/RouterFactory';
import { ITopologySectionParser } from '../drivers/shared/TopologySectionParser';

/**
 * Thin adapter to expose the infra router factory behind an application port.
 */
export class RouterFactoryAdapter implements IRouterFactory {
  private readonly routerFactory: RouterFactory;

  constructor(domService: IDomGateway, topologyParser: ITopologySectionParser) {
    this.routerFactory = new RouterFactory(domService, topologyParser);
  }

  public create(): IRouter {
    return this.routerFactory.create();
  }
}
