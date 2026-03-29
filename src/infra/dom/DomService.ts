import { IDomGateway } from '@/application/ports/IDomGateway';
import { HTMLValueElement } from '@/infra/dom/types';

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

  public updateHTMLElementValue(selector: string, value: string): void {
    const el = this.getHTMLElement(selector, HTMLElement);
    if (!el) return;
    if (this.isValuedElement(el)) el.focus();
    (el as HTMLValueElement).value = value;
    this.dispatchValueEvents(el);
    if (el instanceof HTMLInputElement) el.blur();
  }

  public isElementVisible(selector: string): boolean {
    const el = this.getHTMLElement(selector, HTMLElement);
    if (!el) return false;
    return el.style.display !== 'none' && el.style.visibility !== 'hidden';
  }

  public focusElement(selector: string): void {
    const el = this.getHTMLElement(selector, HTMLElement);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.dispatchEvent(new MouseEvent('focus', { bubbles: true, cancelable: true }));
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
      el.focus();
    }
  }

  public safeClick(selector: string): void {
    const el = this.getHTMLElement(selector, HTMLElement);
    if (!el) return;
    const isJavascriptHref =
      el instanceof HTMLAnchorElement &&
      el.getAttribute('href')?.trimStart().toLowerCase().startsWith('javascript:');
    if (isJavascriptHref) {
      el.addEventListener('click', (e) => e.preventDefault(), {
        capture: true,
        once: true,
      });
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return;
    }
    try {
      el.click();
    } catch {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
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
