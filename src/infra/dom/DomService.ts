import { IDomGateway } from '@/application/ports/IDomGateway';
import type { HTMLValueElement } from '@/infra/dom/types';

export class DomService implements IDomGateway {
  public getHTMLElement<T extends HTMLElement>(selector: string, type: new () => T): T | null {
    const el = document.querySelector(selector);
    if (el instanceof type) return el;
    return null;
  }

  public getHTMLElements<T extends HTMLElement>(selector: string, type: new () => T): T[] {
    const els = document.querySelectorAll(selector);
    if (els.length === 0) return [];
    return Array.from(els).filter((el) => el instanceof type) as T[];
  }

  public getElementValue(selector: string): string | null {
    const el = this.getHTMLElement(selector, HTMLElement);
    if (!el) return null;
    if (this.isValuedElement(el)) return el.value;
    return el.getAttribute('value')?.trim() ?? el.textContent.trim();
  }

  public getElementSelectedOptionText(selector: string): string | null {
    const el = this.getHTMLElement(selector, HTMLSelectElement);
    if (!el) return null;
    const selectedOption = el.selectedOptions[0];
    if (!selectedOption) return null;
    const option = el.selectedIndex >= 0 ? el.options[el.selectedIndex] : selectedOption;
    if (!option) return null;
    return option.textContent.trim();
  }

  public updateHTMLElementValue(element: HTMLValueElement, value: string): void {
    if (element instanceof HTMLInputElement) element.focus();
    element.value = value;
    this.dispatchValueEvents(element);
    if (element instanceof HTMLInputElement) element.blur();
  }

  public safeClick(element: HTMLElement): void {
    const isJavascriptHref =
      element instanceof HTMLAnchorElement &&
      element.getAttribute('href')?.trimStart().toLowerCase().startsWith('javascript:');
    if (isJavascriptHref) {
      element.addEventListener('click', (e) => e.preventDefault(), {
        capture: true,
        once: true,
      });
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return;
    }
    try {
      element.click();
    } catch {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  }

  // Private methods
  private isValuedElement(element: Element): element is HTMLValueElement {
    return (
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement ||
      this.hasStringValue(element)
    );
  }

  private hasStringValue(element: Element): element is HTMLElement & { value: string } {
    return element instanceof HTMLElement && typeof Reflect.get(element, 'value') === 'string';
  }

  private dispatchValueEvents(element: HTMLElement): void {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
