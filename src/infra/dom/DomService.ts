import { IDomGateway } from '@/application/ports/IDomGateway';
import type { ValueElement } from '@/infra/dom/types';

export class DomService implements IDomGateway {
  public isValueElement(element: Element): element is ValueElement {
    return (
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement ||
      (element instanceof HTMLElement && typeof (element as { value?: unknown }).value === 'string')
    );
  }

  public dispatchValueEvents(element: HTMLElement): void {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  public getInputElement(selector: string): HTMLInputElement {
    const element = document.querySelector(selector);
    if (element instanceof HTMLInputElement) return element;
    throw new Error(`Element "${selector}" is not a valid InputElement.`);
  }

  public getValueElement(selector: string): ValueElement {
    const element = document.querySelector(selector);
    if (element && this.isValueElement(element)) return element;
    throw new Error(`Element "${selector}" is not a valid input or select element.`);
  }

  public getValue(selector: string): string {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Element "${selector}" not found.`);
    if (this.isValueElement(element)) return element.value;
    return element.getAttribute('value') ?? (element.textContent ?? '').trim();
  }

  public getOptionalValue(selector: string): string | null {
    const element = document.querySelector(selector);
    if (!element) return null;
    if (this.isValueElement(element)) return element.value;
    return element.getAttribute('value') ?? (element.textContent ?? '').trim();
  }

  public getSelectedOptionText(selector: string): string | null {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLSelectElement)) return null;
    const option =
      element.selectedOptions[0] ??
      (element.selectedIndex >= 0 ? element.options[element.selectedIndex] : null);
    if (!option) return null;
    return (option.textContent ?? '').trim();
  }

  public getElement<T extends HTMLElement>(selector: string, type: new () => T): T {
    const element = document.querySelector(selector);
    if (element instanceof type) return element;
    throw new Error(`Element "${selector}" not found or wrong type.`);
  }

  public getElements<T extends HTMLElement>(selector: string, type: new () => T): T[] {
    const elements = document.querySelectorAll(selector);
    if (elements.length === 0) throw new Error(`Elements "${selector}" not found.`);
    return Array.from(elements).filter((element) => element instanceof type) as T[];
  }

  public updateField(element: ValueElement, value: string): void {
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
}
