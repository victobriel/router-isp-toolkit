import { ZteH199Driver } from '@/infra/drivers/zte/ZteH199Driver/ZteH199Driver';
import { TopologySectionParser } from '@/infra/drivers/shared/TopologySectionParser';
import type { IRouter } from '@/domain/ports/IRouter';
import { ZteH3601Driver } from '@/infra/drivers/zte/ZteH3601Driver/ZteH3601Driver';

/**
 * Infrastructure factory: creates a router adapter for the current page.
 * Composition root: wires drivers and their dependencies (e.g. TopologySectionParser).
 */
export class RouterFactory {
  public static create(): IRouter {
    const title = document.title.toLowerCase();
    const bodyText = document.body.textContent?.toLowerCase();

    if (this.isZteH199(title, bodyText)) {
      return new ZteH199Driver(new TopologySectionParser());
    }

    if (this.isZteH3601(title, bodyText)) {
      return new ZteH3601Driver(new TopologySectionParser());
    }

    throw new Error('Unsupported router model: The extension does not recognize this interface');
  }

  private static isZteH199(title: string, body: string): boolean {
    const indicators = ['h199'];

    for (const term of indicators) {
      if (title.includes(term) || body.includes(term)) {
        return true;
      }
    }

    return false;
  }

  private static isZteH3601(title: string, body: string): boolean {
    const indicators = ['h3601'];

    for (const term of indicators) {
      if (title.includes(term) || body.includes(term)) {
        return true;
      }
    }

    return false;
  }
}
