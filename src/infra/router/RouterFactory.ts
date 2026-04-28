import { IDomGateway } from '@/application/ports/IDomGateway';
import { IRouterFactory } from '@/application/ports/IRouterFactory';
import type { IRouter } from '@/domain/ports/IRouter';
import { ITopologySectionParser } from '@/infra/drivers/shared/TopologySectionParser';
import { ZteH198Driver } from '@/infra/drivers/zte/ZteH198Driver/ZteH198Driver';
import { ZteH199Driver } from '@/infra/drivers/zte/ZteH199Driver/ZteH199Driver';
import { ZteH3601Driver } from '@/infra/drivers/zte/ZteH3601Driver/ZteH3601Driver';
import { HuaweiEG8145V5Driver } from '../drivers/huawei/HuaweiEG8145V5Driver/HuaweiEG8145V5Driver';
import { ZteE2320Driver } from '../drivers/zte/ZteE2320Driver/ZteE2320Driver';

type RouterDriverConstructor = new (
  topologyParser: ITopologySectionParser,
  domService: IDomGateway,
) => IRouter;

type RouterModelDefinition = {
  indicators: string[];
  Driver: RouterDriverConstructor;
};

/**
 * Infrastructure factory: creates a router adapter for the current page.
 * Composition root: wires drivers and their dependencies (e.g. TopologySectionParser).
 */
export class RouterFactory implements IRouterFactory {
  private static readonly MODELS: RouterModelDefinition[] = [
    { indicators: ['h199'], Driver: ZteH199Driver },
    { indicators: ['h3601'], Driver: ZteH3601Driver },
    { indicators: ['h198'], Driver: ZteH198Driver },
    { indicators: ['e2320'], Driver: ZteE2320Driver },
    { indicators: ['eg8145v5'], Driver: HuaweiEG8145V5Driver },
  ];

  private readonly domService: IDomGateway;
  private readonly topologyParser: ITopologySectionParser;

  constructor(domService: IDomGateway, topologyParser: ITopologySectionParser) {
    this.domService = domService;
    this.topologyParser = topologyParser;
  }

  public create(): IRouter {
    const title = document.title.toLowerCase();
    const bodyText = document.body.textContent?.toLowerCase();

    for (const model of RouterFactory.MODELS) {
      if (this.hasModelIndicator(model.indicators, title, bodyText)) {
        return new model.Driver(this.topologyParser, this.domService);
      }
    }

    throw new Error('Unsupported router model: The extension does not recognize this interface');
  }

  private hasModelIndicator(indicators: string[], title: string, body: string): boolean {
    for (const term of indicators) {
      if (title.includes(term) || body.includes(term)) {
        return true;
      }
    }

    return false;
  }
}
