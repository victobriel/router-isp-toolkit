import { IDomGateway } from '@/application/ports/IDomGateway';
import { IRouterFactory } from '@/application/ports/IRouterFactory';
import type { IRouter } from '@/domain/ports/IRouter';
import { ITopologySectionParser } from '@/infra/drivers/shared/TopologySectionParser';
import { ZteH198Driver } from '@/infra/drivers/zte/ZteH198Driver/ZteH198Driver';
import { ZteH199Driver } from '@/infra/drivers/zte/ZteH199Driver/ZteH199Driver';
import { ZteH3601Driver } from '@/infra/drivers/zte/ZteH3601Driver/ZteH3601Driver';
import { HuaweiEG8145V5Driver } from '../drivers/huawei/HuaweiEG8145V5Driver/HuaweiEG8145V5Driver';

/**
 * Infrastructure factory: creates a router adapter for the current page.
 * Composition root: wires drivers and their dependencies (e.g. TopologySectionParser).
 */
export class RouterFactory implements IRouterFactory {
  private readonly domService: IDomGateway;
  private readonly topologyParser: ITopologySectionParser;

  constructor(domService: IDomGateway, topologyParser: ITopologySectionParser) {
    this.domService = domService;
    this.topologyParser = topologyParser;
  }

  public create(): IRouter {
    const title = document.title.toLowerCase();
    const bodyText = document.body.textContent?.toLowerCase();

    if (this.isZteH199(title, bodyText)) {
      return new ZteH199Driver(this.topologyParser, this.domService);
    }

    if (this.isZteH3601(title, bodyText)) {
      return new ZteH3601Driver(this.topologyParser, this.domService);
    }

    if (this.isZteH198(title, bodyText)) {
      return new ZteH198Driver(this.topologyParser, this.domService);
    }

    if (this.isHuaweiEG8145V5(title, bodyText)) {
      return new HuaweiEG8145V5Driver(this.topologyParser, this.domService);
    }

    throw new Error('Unsupported router model: The extension does not recognize this interface');
  }

  private isZteH199(title: string, body: string): boolean {
    const indicators = ['h199'];

    for (const term of indicators) {
      if (title.includes(term) || body.includes(term)) {
        return true;
      }
    }

    return false;
  }

  private isZteH3601(title: string, body: string): boolean {
    const indicators = ['h3601'];

    for (const term of indicators) {
      if (title.includes(term) || body.includes(term)) {
        return true;
      }
    }

    return false;
  }

  private isZteH198(title: string, body: string): boolean {
    const indicators = ['h198'];

    for (const term of indicators) {
      if (title.includes(term) || body.includes(term)) {
        return true;
      }
    }

    return false;
  }

  private isHuaweiEG8145V5(title: string, body: string): boolean {
    const indicators = ['eg8145v5'];

    for (const term of indicators) {
      if (title.includes(term) || body.includes(term)) {
        return true;
      }
    }

    return false;
  }
}
