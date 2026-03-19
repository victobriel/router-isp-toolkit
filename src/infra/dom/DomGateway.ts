import type { IDomGateway, ValueElement } from '@/application/ports/IDomGateway';

import { DomService } from '@/infra/dom/DomService';

/**
 * Adapter that exposes `DomService` behind an application port.
 */
export class DomGateway implements IDomGateway {
  public getElement<T extends HTMLElement>(selector: string, type: new () => T): T {
    return DomService.getElement(selector, type);
  }

  public getValueElement(selector: string): ValueElement {
    return DomService.getValueElement(selector) as ValueElement;
  }

  public updateField(element: ValueElement, value: string): void {
    DomService.updateField(element, value);
  }
}
