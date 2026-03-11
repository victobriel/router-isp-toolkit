import type { ValueElement } from "./types.js";

export class DomService {
  private static isValueElement(element: Element): element is ValueElement {
    return (
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement ||
      (element instanceof HTMLElement &&
        typeof (element as { value?: unknown }).value === "string")
    );
  }

  private static dispatchValueEvents(element: HTMLElement): void {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  public static getInputElement(selector: string): HTMLInputElement {
    const element = document.querySelector(selector);
    if (element instanceof HTMLInputElement) return element;
    throw new Error(`Element "${selector}" is not a valid InputElement.`);
  }

  public static getValueElement(selector: string): ValueElement {
    const element = document.querySelector(selector);
    if (element && DomService.isValueElement(element)) return element;
    throw new Error(
      `Element "${selector}" is not a valid input or select element.`
    );
  }

  public static getValue(selector: string): string {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Element "${selector}" not found.`);
    if (DomService.isValueElement(element)) return element.value;
    return element.getAttribute("value") ?? (element.textContent ?? "").trim();
  }

  public static getOptionalValue(selector: string): string | null {
    const element = document.querySelector(selector);
    if (!element) return null;
    if (DomService.isValueElement(element)) return element.value;
    return element.getAttribute("value") ?? (element.textContent ?? "").trim();
  }

  public static getSelectedOptionText(selector: string): string | null {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLSelectElement)) return null;

    const option =
      element.selectedOptions[0] ??
      (element.selectedIndex >= 0 ? element.options[element.selectedIndex] : null);

    if (!option) return null;
    return (option.textContent ?? "").trim();
  }

  public static getElement<T extends HTMLElement>(
    selector: string,
    type: new () => T
  ): T {
    const element = document.querySelector(selector);
    if (element instanceof type) return element;
    throw new Error(`Element "${selector}" not found or wrong type.`);
  }

  public static getElements<T extends HTMLElement>(
    selector: string,
    type: new () => T
  ): T[] {
    const elements = document.querySelectorAll(selector);
    if (elements.length === 0)
      throw new Error(`Elements "${selector}" not found.`);
    return Array.from(elements).filter(
      (element) => element instanceof type
    ) as T[];
  }

  public static updateField(element: ValueElement, value: string): void {
    if (element instanceof HTMLInputElement) element.focus();
    element.value = value;
    DomService.dispatchValueEvents(element);
    if (element instanceof HTMLInputElement) element.blur();
  }

  public static safeClick(element: HTMLElement): void {
    const isJavascriptHref =
      element instanceof HTMLAnchorElement &&
      element
        .getAttribute("href")
        ?.trimStart()
        .toLowerCase()
        .startsWith("javascript:");

    if (isJavascriptHref) {
      element.addEventListener("click", (e) => e.preventDefault(), {
        capture: true,
        once: true,
      });
      element.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
      return;
    }

    try {
      element.click();
    } catch {
      element.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    }
  }
}
